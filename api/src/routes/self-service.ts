import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, AuthUser, Locale } from "../env";
import { ApiError, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { CONTINENTAL, assertCountry, countryFilter, inCountry, isStaff } from "../lib/access";
import { localized } from "../lib/localized";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { localParts } from "../lib/time";
import { currentUser, requireRole, staff } from "../middleware/auth";
import { loadFixtures } from "../domain/engine-ctx";

/*
 * What a referee does for themselves, beyond their dashboard (routes/me.ts):
 *   /me/calendar.ics, /me/convocations/:fixtureId, /me/earnings, /me/payments/:id/slip, DELETE /me/advances/:id
 *   /assessments/:id/comments (+ the staff inbox /assessment-comments)
 *   /cases/:id/defence
 * Each read is confined to the caller's own records; another referee's answer 404 (existence is not leaked).
 */

export const meSelf = new Hono<AppEnv>();
export const assessmentComments = new Hono<AppEnv>();
export const assessmentInbox = new Hono<AppEnv>();
export const caseDefence = new Hono<AppEnv>();

// Same guard as routes/me.ts: these are an official's own records.
meSelf.use("*", async (c, next) => {
  if (!currentUser(c).officialId) throw new ApiError(403, "no_official", "This account is not linked to an official");
  await next();
});

const addDays = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

type CrewRole = "R" | "AR1" | "AR2" | "FOURTH" | "VAR" | "AVAR" | "OBS";
const ROLE_LABEL: Record<CrewRole, Record<Locale, string>> = {
  R: { fr: "Arbitre central", en: "Referee", es: "Árbitro principal", de: "Schiedsrichter" },
  AR1: { fr: "Arbitre assistant 1", en: "Assistant referee 1", es: "Árbitro asistente 1", de: "Schiedsrichterassistent 1" },
  AR2: { fr: "Arbitre assistant 2", en: "Assistant referee 2", es: "Árbitro asistente 2", de: "Schiedsrichterassistent 2" },
  FOURTH: { fr: "Quatrième arbitre", en: "Fourth official", es: "Cuarto árbitro", de: "Vierter Offizieller" },
  VAR: { fr: "VAR", en: "VAR", es: "VAR", de: "VAR" },
  AVAR: { fr: "Assistant VAR", en: "Assistant VAR", es: "Asistente VAR", de: "Assistent VAR" },
  OBS: { fr: "Observateur", en: "Observer", es: "Observador", de: "Beobachter" },
};
const roleLabel = (role: string, locale: Locale) => ROLE_LABEL[role as CrewRole]?.[locale] ?? role;

/** Staff who hear about something in a country: its federation, or the administrators for a continental record. */
const staffAudience = (countryCode: string | null) =>
  countryCode && countryCode !== CONTINENTAL ? { audienceRole: "federation" as const, countryCode } : { audienceRole: "admin" as const };

/* ------------------------------------------------------------------ *
 * Calendar export — RFC 5545
 * ------------------------------------------------------------------ */

/** TEXT value escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, and newlines as \n. */
export function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (§3.1), never inside a UTF-8 sequence; continuation lines start with a space. */
export function icsFold(line: string) {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 75) {
      parts.push(current);
      current = ` ${ch}`;
      size = 1 + n;
    } else {
      current += ch;
      size += n;
    }
  }
  parts.push(current);
  return parts.join("\r\n");
}

/** An instant as a UTC DATE-TIME: 20361004T183000Z. Venue time zones are not shipped; every client converts from UTC. */
export const icsInstant = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

meSelf.get("/calendar.ics", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT d.fixture_id AS fixtureId, d.role, d.state, d.version, f.kickoff_at AS kickoffAt, f.status, ht.name AS home, aw.name AS away,
              st.name AS venue, COALESCE(st.city, ht.city) AS city, co.name AS competition
         FROM designations d
         JOIN fixtures f ON f.id = d.fixture_id
         JOIN teams ht ON ht.id = f.home_team_id
         JOIN teams aw ON aw.id = f.away_team_id
         JOIN competitions co ON co.id = f.competition_id
         LEFT JOIN stadiums st ON st.id = f.stadium_id
        WHERE d.official_id = ? AND d.state IN ('pending', 'confirmed') AND f.status <> 'cancelled' AND f.date >= ?
        ORDER BY f.kickoff_at LIMIT 500`,
    )
    .bind(user.officialId, addDays(today(), -90))
    .all<{ fixtureId: string; role: string; state: string; version: number; kickoffAt: string; status: string; home: string; away: string; venue: string | null; city: string | null; competition: string }>();

  const stamp = icsInstant(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ARIS//Designations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`ARIS — ${user.name}`)}`,
  ];
  for (const r of results) {
    const start = new Date(r.kickoffAt);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    const where = [r.venue, r.city].filter(Boolean).join(", ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.fixtureId}-${r.role}@aris`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsInstant(start.toISOString())}`,
      `DTEND:${icsInstant(end.toISOString())}`,
      `SEQUENCE:${r.version}`,
      `SUMMARY:${icsText(`${roleLabel(r.role, user.locale)} · ${r.home} – ${r.away}`)}`,
      ...(where ? [`LOCATION:${icsText(where)}`] : []),
      `DESCRIPTION:${icsText(r.competition)}`,
      // an unanswered designation, or a postponed match, is not settled yet
      `STATUS:${r.state === "confirmed" && r.status === "scheduled" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return c.body(lines.map(icsFold).join("\r\n") + "\r\n", 200, {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": 'attachment; filename="aris-designations.ics"',
    "cache-control": "no-store",
  });
});

/* ------------------------------------------------------------------ *
 * Convocation — the official's own copy, once the crew is published and they have accepted
 * ------------------------------------------------------------------ */

meSelf.get("/convocations/:fixtureId", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  // the referee scope only ever loads fixtures they are designated to: anything else is a 404
  const [fixture] = await loadFixtures(db, { ids: [c.req.param("fixtureId")], scope: user });
  const slot = fixture?.crew.find((s) => s.officialId === user.officialId && s.state === "confirmed");
  if (!fixture || !slot) throw notFound("Convocation");
  if (fixture.designationStatus !== "published") throw new ApiError(409, "not_published", "The convocation is issued once the federation publishes the crew");
  const ids = [...new Set(fixture.crew.filter((s) => s.officialId && s.state !== "declined").map((s) => s.officialId!))];
  const [people, meta, me] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT id, name FROM officials WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids),
    db
      .prepare(
        `SELECT co.name AS competition, co.season, f.published_at AS publishedAt, fe.name AS federationName, fe.code AS federationCode
           FROM fixtures f JOIN competitions co ON co.id = f.competition_id LEFT JOIN federations fe ON fe.country = f.country_code WHERE f.id = ?`,
      )
      .bind(fixture.id),
    db.prepare("SELECT name, matricule, licence_no AS licenceNo FROM officials WHERE id = ?").bind(user.officialId),
  ]);
  const names = new Map((people.results as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const m = meta.results[0] as { competition: string; season: string | null; publishedAt: string | null; federationName: string | null; federationCode: string | null };
  return c.json({
    convocation: {
      fixtureId: fixture.id,
      role: slot.role,
      competition: m.competition,
      season: m.season,
      round: fixture.roundLabel ?? fixture.matchday,
      home: fixture.home,
      away: fixture.away,
      date: fixture.date,
      kickoff: fixture.kickoff,
      kickoffAt: fixture.kickoffAt,
      timezone: fixture.timezone,
      venue: fixture.venue,
      city: fixture.city,
      countryCode: fixture.countryCode,
      publishedAt: m.publishedAt,
      // continental ties are convened by CAF itself
      issuer: fixture.countryCode === CONTINENTAL ? { name: "CAF", code: "CAF" } : m.federationName ? { name: m.federationName, code: m.federationCode } : null,
      official: me.results[0],
      // colleagues by name and role only: their contact details stay with the federation
      crew: fixture.crew.filter((s) => s.officialId && s.state !== "declined").map((s) => ({ role: s.role, name: names.get(s.officialId!) ?? "", me: s.officialId === user.officialId })),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Money — earnings summary, payment slip, withdrawing an advance request
 * ------------------------------------------------------------------ */

meSelf.get("/earnings", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ by: z.enum(["season", "year"]).default("season") }));
  // pending = owed but not yet paid (due or validated); cancelled lines are not money
  const { results } = await c.env.DB.prepare(
    `SELECT CASE WHEN ?1 = 'season' THEN COALESCE(co.season, substr(f.date, 1, 4)) ELSE substr(f.date, 1, 4) END AS period, p.currency,
            SUM(CASE WHEN p.status = 'paid' THEN p.total ELSE 0 END) AS paid,
            SUM(CASE WHEN p.status IN ('due', 'validated') THEN p.total ELSE 0 END) AS pending,
            SUM(CASE WHEN p.status = 'contested' THEN p.total ELSE 0 END) AS contested,
            COUNT(*) AS lines
       FROM payments p JOIN fixtures f ON f.id = p.fixture_id LEFT JOIN competitions co ON co.id = f.competition_id
      WHERE p.official_id = ?2 AND p.status <> 'cancelled'
      GROUP BY period, p.currency ORDER BY period DESC, p.currency`,
  )
    .bind(q.by, user.officialId)
    .all<{ period: string; currency: string; paid: number; pending: number; contested: number; lines: number }>();
  return c.json({ by: q.by, periods: results });
});

meSelf.get("/payments/:id/slip", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const row = await db
    .prepare(
      `SELECT p.id, p.official_id AS officialId, p.role, p.base, p.transport, p.lodging, p.meals, p.bonus, p.deduction, p.total, p.currency, p.status,
              p.paid_at AS paidAt, p.payment_ref AS paymentRef, f.id AS fixtureId, f.country_code AS countryCode, f.kickoff_at AS kickoffAt,
              ht.name AS home, aw.name AS away, co.name AS competition, co.season, st.name AS venue, COALESCE(st.city, ht.city) AS city,
              COALESCE(sc.timezone, fc.timezone, hc.timezone, 'UTC') AS tz,
              o.name AS officialName, o.matricule, o.licence_no AS licenceNo, fe.name AS federationName, fe.code AS federationCode
         FROM payments p
         JOIN officials o ON o.id = p.official_id
         JOIN fixtures f ON f.id = p.fixture_id
         JOIN teams ht ON ht.id = f.home_team_id
         JOIN teams aw ON aw.id = f.away_team_id
         JOIN competitions co ON co.id = f.competition_id
         LEFT JOIN stadiums st ON st.id = f.stadium_id
         LEFT JOIN countries sc ON sc.code = st.country
         LEFT JOIN countries fc ON fc.code = f.country_code
         LEFT JOIN countries hc ON hc.code = ht.country
         LEFT JOIN federations fe ON fe.country = f.country_code
        WHERE p.id = ?`,
    )
    .bind(c.req.param("id"))
    .first<{ officialId: string; status: string; kickoffAt: string; tz: string; countryCode: string; federationName: string | null; federationCode: string | null } & Record<string, unknown>>();
  if (!row || row.officialId !== user.officialId) throw notFound("Payment");
  if (row.status !== "paid") throw new ApiError(409, "not_paid", "A payment slip exists once the line is paid");
  const { tz, kickoffAt, federationName, federationCode, ...rest } = row;
  const local = localParts(kickoffAt, tz);
  return c.json({
    slip: {
      ...rest,
      kickoffAt,
      date: local.date,
      kickoff: local.time,
      timezone: tz,
      payer: row.countryCode === CONTINENTAL ? { name: "CAF", code: "CAF" } : federationName ? { name: federationName, code: federationCode } : null,
    },
  });
});

// Only while nobody has decided on it: once approved or rejected, it is the federation's record.
meSelf.delete("/advances/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const row = await db
    .prepare("SELECT a.official_id AS officialId, a.status, a.amount, a.currency, a.justification, o.name, o.country_code AS countryCode FROM advances a JOIN officials o ON o.id = a.official_id WHERE a.id = ?")
    .bind(id)
    .first<{ officialId: string; status: string; amount: number; currency: string; justification: string; name: string; countryCode: string }>();
  if (!row || row.officialId !== user.officialId) throw notFound("Advance");
  if (row.status !== "requested") throw new ApiError(409, "bad_state", "Only a request nobody has decided on yet can be withdrawn");
  const res = await db.batch([
    db.prepare("DELETE FROM advances WHERE id = ? AND status = 'requested'").bind(id),
    auditStmt(db, user, { action: "advance.withdraw", entity: "advance", entityId: id, before: { amount: row.amount, currency: row.currency, justification: row.justification }, countryCode: row.countryCode, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "federation",
      countryCode: row.countryCode,
      dedupeKey: `advance-withdrawn:${id}`,
      title: localized("Demande d'avance retirée", "Advance request withdrawn"),
      detail: localized(`${row.name} a retiré sa demande de ${row.amount} ${row.currency}.`, `${row.name} withdrew their request for ${row.amount} ${row.currency}.`),
      tone: "amber",
      href: "/finance?tab=advances",
    }),
  ]);
  if (!res[0].meta.changes) throw new ApiError(409, "bad_state", "Only a request nobody has decided on yet can be withdrawn");
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Comments on a released assessment — the assessed referee comments or contests, staff answer
 * ------------------------------------------------------------------ */

interface AssessmentRef {
  id: string;
  refereeId: string;
  refereeName: string;
  state: string;
  published: number;
  overall: number;
  countryCode: string | null;
}

/** The report, if the caller may discuss it: staff of its country (404 otherwise), or the referee it is about once released. */
async function loadDiscussed(db: D1Database, user: AuthUser, id: string) {
  const row = await db
    .prepare(
      `SELECT a.id, a.referee_id AS refereeId, o.name AS refereeName, a.state, a.published, a.overall, c.country_code AS countryCode
         FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id JOIN officials o ON o.id = a.referee_id
        WHERE a.id = ?`,
    )
    .bind(id)
    .first<AssessmentRef>();
  if (!row) throw notFound("Assessment");
  if (isStaff(user)) {
    if (!inCountry(user, row.countryCode)) throw notFound("Assessment");
  } else if (user.officialId !== row.refereeId || row.published !== 1 || row.state !== "filed") {
    throw notFound("Assessment");
  }
  return row;
}

const COMMENT_COLS = "k.id, k.kind, k.body, k.author_role AS authorRole, u.name AS authorName, k.created_at AS createdAt";

/** none: never contested; open: the latest contest has no answer after it; answered. */
function contestState(comments: Array<{ kind: string }>) {
  let state: "none" | "open" | "answered" = "none";
  for (const k of comments) {
    if (k.kind === "contest") state = "open";
    else if (k.kind === "response" && state === "open") state = "answered";
  }
  return state;
}

assessmentComments.get("/:id/comments", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const a = await loadDiscussed(db, user, c.req.param("id"));
  const { results } = await db
    .prepare(`SELECT ${COMMENT_COLS} FROM assessment_comments k LEFT JOIN users u ON u.id = k.author_user_id WHERE k.assessment_id = ? ORDER BY k.created_at, k.rowid`)
    .bind(a.id)
    .all<{ kind: string } & Record<string, unknown>>();
  return c.json({ comments: results, contest: contestState(results) });
});

const commentSchema = z.object({ kind: z.enum(["comment", "contest", "response"]).optional(), body: z.string().trim().min(3).max(2000) });

assessmentComments.post("/:id/comments", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(c, commentSchema);
  const a = await loadDiscussed(db, user, c.req.param("id"));
  const staffSide = isStaff(user);
  // the referee comments or contests; staff only ever answer
  if (staffSide ? b.kind !== undefined && b.kind !== "response" : b.kind === "response") {
    throw new ApiError(422, "validation_failed", staffSide ? "Staff answer the referee" : "Comment on or contest the report", [{ path: "kind", message: "Not allowed for your role" }]);
  }
  const kind = staffSide ? "response" : (b.kind ?? "comment");
  const id = uuid();
  const notice = staffSide
    ? await notifyOfficialStmts(db, a.refereeId, {
        title: localized("Réponse à votre commentaire d'évaluation", "Reply to your assessment comment"),
        detail: localized(b.body.slice(0, 140), b.body.slice(0, 140)),
        tone: "var",
        href: "/me",
      })
    : notifyStmts(db, {
        ...staffAudience(a.countryCode),
        dedupeKey: `assessment-comment:${id}`,
        title: kind === "contest" ? localized("Évaluation contestée", "Assessment contested") : localized("Commentaire sur une évaluation", "Comment on an assessment"),
        detail: localized(`${a.refereeName} (${a.overall}/10) : ${b.body.slice(0, 120)}`, `${a.refereeName} (${a.overall}/10): ${b.body.slice(0, 120)}`),
        tone: kind === "contest" ? "red" : "amber",
        href: `/assessments?report=${encodeURIComponent(a.id)}`,
      });
  await db.batch([
    db.prepare("INSERT INTO assessment_comments (id, assessment_id, author_user_id, author_role, kind, body) VALUES (?, ?, ?, ?, ?, ?)").bind(id, a.id, user.id, user.role, kind, b.body),
    auditStmt(db, user, { action: `assessment.${kind}`, entity: "assessment", entityId: a.id, after: { commentId: id, length: b.body.length }, countryCode: a.countryCode, ip: c.get("ip") }),
    ...notice,
  ]);
  return c.json({ comment: { id, kind, body: b.body, authorRole: user.role, authorName: user.name } }, 201);
});

// Staff inbox: the reports of their scope where the referee spoke last (awaiting an answer), or every discussed one.
assessmentInbox.get("/", staff, async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ status: z.enum(["awaiting", "all"]).default("awaiting") }));
  const scope = countryFilter(user, "c.country_code");
  const { results } = await c.env.DB.prepare(
    `SELECT a.id AS assessmentId, a.match_id AS matchId, a.referee_id AS refereeId, o.name AS refereeName, c.country_code AS countryCode, a.overall,
            x.kind AS lastKind, x.body AS lastBody, x.created_at AS lastAt,
            EXISTS (SELECT 1 FROM assessment_comments k WHERE k.assessment_id = a.id AND k.kind = 'contest') AS contested
       FROM assessments a
       JOIN matches m ON m.id = a.match_id
       LEFT JOIN competitions c ON c.id = m.league_id
       JOIN officials o ON o.id = a.referee_id
       JOIN assessment_comments x ON x.id = (SELECT id FROM assessment_comments WHERE assessment_id = a.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
      WHERE ${scope.sql} ${q.status === "awaiting" ? "AND x.kind <> 'response'" : ""}
      ORDER BY x.created_at DESC LIMIT 200`,
  )
    .bind(...scope.params)
    .all<{ contested: number } & Record<string, unknown>>();
  return c.json({ threads: results.map((r) => ({ ...r, contested: r.contested === 1 })) });
});

/* ------------------------------------------------------------------ *
 * A written defence on a disciplinary case, filed by the official concerned before the decision
 * ------------------------------------------------------------------ */

async function loadCaseFor(db: D1Database, user: AuthUser, id: string) {
  const row = await db
    .prepare("SELECT c.id, c.official_id AS officialId, c.status, o.name AS officialName, o.country_code AS countryCode FROM disciplinary_cases c JOIN officials o ON o.id = c.official_id WHERE c.id = ?")
    .bind(id)
    .first<{ id: string; officialId: string; status: string; officialName: string; countryCode: string }>();
  if (!row) throw notFound("Case");
  if (isStaff(user)) assertCountry(user, row.countryCode, "Case");
  else if (!user.officialId || user.officialId !== row.officialId) throw notFound("Case");
  return row;
}

caseDefence.get("/:id/defence", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const row = await loadCaseFor(db, user, c.req.param("id"));
  const defence = await db
    .prepare("SELECT d.statement, d.filed_at AS filedAt, d.updated_at AS updatedAt, u.name AS filedBy FROM case_defences d LEFT JOIN users u ON u.id = d.filed_by WHERE d.case_id = ?")
    .bind(row.id)
    .first();
  return c.json({ defence: defence ?? null });
});

caseDefence.post("/:id/defence", requireRole("referee"), async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const { statement } = await readJson(c, z.object({ statement: z.string().trim().min(10).max(5000) }));
  const row = await loadCaseFor(db, user, c.req.param("id"));
  if (row.status !== "opened" && row.status !== "hearing_scheduled") throw new ApiError(409, "case_decided", "A defence is filed before the decision");
  const existing = await db.prepare("SELECT 1 AS x FROM case_defences WHERE case_id = ?").bind(row.id).first();
  await db.batch([
    db
      .prepare(
        `INSERT INTO case_defences (case_id, statement, filed_by) VALUES (?, ?, ?)
         ON CONFLICT (case_id) DO UPDATE SET statement = excluded.statement, filed_by = excluded.filed_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .bind(row.id, statement, user.id),
    auditStmt(db, user, { action: existing ? "case.defence_update" : "case.defence", entity: "case", entityId: row.id, after: { length: statement.length }, countryCode: row.countryCode, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "federation",
      countryCode: row.countryCode,
      title: localized("Mémoire en défense déposé", "Defence statement filed"),
      detail: localized(`${row.officialName} a déposé sa défense écrite.`, `${row.officialName} filed a written defence.`),
      tone: "amber",
      href: "/discipline?tab=cases",
    }),
  ]);
  return c.json({ ok: true, updated: !!existing }, existing ? 200 : 201);
});
