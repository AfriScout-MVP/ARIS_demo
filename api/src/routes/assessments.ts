import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { CONTINENTAL, assertCountry, assertTaggingCountry, countryFilter, inCountry, isAdmin, isStaff, isTagger, taggingCountryFilter } from "../lib/access";
import { localized, type Localized } from "../lib/localized";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { currentUser, requireRole, staff } from "../middleware/auth";
import { json } from "../domain/mappers";
import { MATCH_SQL, toDecision, toMatch, type DecisionRow, type MatchRow } from "../domain/matches";
import { EVENT_TYPE_KEYS, REFEREE_EVENT_TAXONOMY, resolveEventFlow } from "../domain/eventTaxonomy";

export const assessments = new Hono<AppEnv>();
export const matches = new Hono<AppEnv>();
export const criteria = new Hono<AppEnv>();
export const dossiers = new Hono<AppEnv>();

/** Copy typed by a person: French and English are required, Spanish and German optional. */
const localizedText = (max: number) => z.object({ fr: z.string().min(1).max(max), en: z.string().min(1).max(max), es: z.string().max(max).optional(), de: z.string().max(max).optional() });
const optionalText = (max: number) => z.object({ fr: z.string().max(max).default(""), en: z.string().max(max).default(""), es: z.string().max(max).optional(), de: z.string().max(max).optional() });

const countryParam = z.string().length(3).transform((v) => v.toUpperCase());

/** The country a match belongs to (its competition's country), or a 404 when there is no such match. */
async function matchCountry(db: D1Database, matchId: string) {
  const row = await db
    .prepare("SELECT m.id, c.country_code AS countryCode FROM matches m LEFT JOIN competitions c ON c.id = m.league_id WHERE m.id = ?")
    .bind(matchId)
    .first<{ id: string; countryCode: string | null }>();
  if (!row) throw notFound("Match");
  return row.countryCode;
}

/** Federation seats of the match's country hear about it; continental matches go to the platform administrators. */
function staffNotice(countryCode: string | null) {
  return countryCode && countryCode !== CONTINENTAL ? { audienceRole: "federation" as const, countryCode } : { audienceRole: "admin" as const };
}

/* ------------------------------------------------------------------ *
 * The evaluation grid — one platform grid, weights total 100
 * ------------------------------------------------------------------ */

interface Criterion {
  key: string;
  label: Localized;
  weight: number;
}

async function loadCriteria(db: D1Database): Promise<Criterion[]> {
  const { results } = await db.prepare("SELECT key, label, weight FROM evaluation_criteria ORDER BY sort, key").all<{ key: string; label: string; weight: number }>();
  return results.map((r) => ({ key: r.key, label: json<Localized>(r.label, { fr: r.key, en: r.key }), weight: r.weight }));
}

criteria.get("/", async (c) => c.json({ criteria: await loadCriteria(c.env.DB) }));

const gridSchema = z
  .array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,30}$/), label: localizedText(80), weight: z.number().int().min(1).max(100) }))
  .min(2)
  .max(12)
  .refine((rows) => rows.reduce((s, r) => s + r.weight, 0) === 100, { message: "Weights must total 100" })
  .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, { message: "Criterion keys must be unique" });

// The grid is the platform's official scale: changing it is an administrator's act, and it is logged.
criteria.put("/", requireRole("admin"), async (c) => {
  const user = currentUser(c);
  const rows = await readJson(c, z.object({ criteria: gridSchema }));
  const db = c.env.DB;
  const before = await loadCriteria(db);
  await db.batch([
    db.prepare("DELETE FROM evaluation_criteria"),
    ...rows.criteria.map((r, i) => db.prepare("INSERT INTO evaluation_criteria (key, label, weight, sort) VALUES (?, ?, ?, ?)").bind(r.key, JSON.stringify(r.label), r.weight, i)),
    auditStmt(db, user, { action: "criteria.set", entity: "evaluation_criteria", before, after: rows.criteria, ip: c.get("ip") }),
  ]);
  return c.json({ criteria: rows.criteria });
});

/* ------------------------------------------------------------------ *
 * Matches (played) & their decisions
 * ------------------------------------------------------------------ */

matches.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ refereeId: z.string().optional(), country: countryParam.optional(), status: z.string().optional(), limit: z.coerce.number().int().min(1).max(300).default(100) }));
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (isStaff(user) || isTagger(user)) {
    const scope = isTagger(user) ? taggingCountryFilter(user, "c.country_code") : countryFilter(user, "c.country_code");
    where.push(scope.sql);
    args.push(...scope.params);
    if (q.country) (where.push("c.country_code = ?"), args.push(q.country));
    if (q.refereeId) (where.push("m.referee_id = ?"), args.push(q.refereeId));
  } else {
    // a referee sees the matches they refereed, and those they were appointed to observe
    if (!user.officialId) throw forbidden();
    where.push("(m.referee_id = ? OR m.fixture_id IN (SELECT fixture_id FROM designations WHERE official_id = ? AND role = 'OBS'))");
    args.push(user.officialId, user.officialId);
  }
  if (q.status) (where.push("m.status = ?"), args.push(q.status));
  const { results } = await c.env.DB.prepare(`${MATCH_SQL} WHERE ${where.join(" AND ")} ORDER BY m.match_date DESC LIMIT ?`)
    .bind(...args, q.limit)
    .all<MatchRow>();
  return c.json({
    matches: results.map((r) => {
      const { decisions: _decisions, ...light } = toMatch(r);
      return light;
    }),
  });
});

// The referee-decision taxonomy, read by every authenticated role (including tagger and referee, who both
// legitimately need to render the tagging flow). Registered before "/:id" so this literal segment isn't
// swallowed by the param route.
matches.get("/event-types", async (c) => {
  currentUser(c);
  return c.json({ eventTypes: REFEREE_EVENT_TAXONOMY });
});

matches.get("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const m = await db.prepare(`${MATCH_SQL} WHERE m.id = ?`).bind(id).first<MatchRow>();
  if (!m) throw notFound("Match");
  if (isStaff(user) || isTagger(user)) {
    if (isTagger(user)) assertTaggingCountry(user, m.country_code, "Match");
    else assertCountry(user, m.country_code, "Match");
  } else {
    const observing =
      !!user.officialId &&
      !!m.fixture_id &&
      !!(await db.prepare("SELECT 1 AS x FROM designations WHERE fixture_id = ? AND role = 'OBS' AND official_id = ?").bind(m.fixture_id, user.officialId).first());
    if (user.officialId !== m.referee_id && !observing) throw notFound("Match");
  }
  const { results } = await db.prepare("SELECT * FROM match_decisions WHERE match_id = ? ORDER BY minute").bind(id).all<DecisionRow>();
  return c.json({ match: toMatch(m, results, { withHeat: true }), decisions: results.map(toDecision) });
});

const decisionSchema = z.object({
  minute: z.number().int().min(0).max(130),
  eventType: z.enum(EVENT_TYPE_KEYS),
  subEvent: z.string().max(60).optional(),
  outcome: z.string().max(60).optional(),
  description: localizedText(300),
  initialCall: z.enum(["given", "not-given"]),
  varReview: z.boolean().default(false),
  finalCall: z.enum(["confirmed", "overturned"]),
  confidence: z.number().min(0).max(100).default(0),
  pressureIndex: z.number().min(0).max(100).default(0),
  distance: z.number().min(0).max(120).default(0),
  players: z.array(z.string().max(80)).max(6).default([]),
});

// Staff (admin/federation) tag any match of their scope; a tagger tags matches of its own country. A plain
// `requireRole` guard can't express that OR, so the check is local to the handler.
matches.post("/:id/decisions", async (c) => {
  const user = currentUser(c);
  if (!isStaff(user) && !isTagger(user)) throw forbidden();
  const matchId = c.req.param("id");
  const b = await readJson(c, decisionSchema);
  const flow = resolveEventFlow(b.eventType, b.subEvent, b.outcome);
  if (!flow.valid) throw new ApiError(422, "invalid_event_flow", "That sub-event or outcome does not belong to this event type");
  const db = c.env.DB;
  const countryCode = await matchCountry(db, matchId);
  if (isTagger(user)) assertTaggingCountry(user, countryCode, "Match");
  else assertCountry(user, countryCode, "Match");
  const id = uuid();
  await db.batch([
    db
      .prepare(
        "INSERT INTO match_decisions (id, match_id, minute, type, sub_event, outcome, description, initial_call, var_review, final_call, confidence, pressure_index, distance, players, tagged_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, matchId, b.minute, b.eventType, b.subEvent ?? null, b.outcome ?? null, JSON.stringify(b.description), b.initialCall, b.varReview ? 1 : 0, b.finalCall, b.confidence, b.pressureIndex, b.distance, JSON.stringify(b.players), user.id),
    auditStmt(db, user, { action: "decision.log", entity: "match", entityId: matchId, after: { minute: b.minute, eventType: b.eventType, subEvent: b.subEvent, outcome: b.outcome }, countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ id }, 201);
});

// A decision logged by mistake is removed, not edited: the audit keeps what it said.
matches.delete("/:id/decisions/:decisionId", async (c) => {
  const user = currentUser(c);
  if (!isStaff(user) && !isTagger(user)) throw forbidden();
  const matchId = c.req.param("id");
  const decisionId = c.req.param("decisionId");
  const db = c.env.DB;
  const countryCode = await matchCountry(db, matchId);
  if (isTagger(user)) assertTaggingCountry(user, countryCode, "Match");
  else assertCountry(user, countryCode, "Match");
  const row = await db.prepare("SELECT minute, type, sub_event, outcome FROM match_decisions WHERE id = ? AND match_id = ?").bind(decisionId, matchId).first<{ minute: number; type: string; sub_event: string | null; outcome: string | null }>();
  if (!row) throw notFound("Decision");
  await db.batch([
    db.prepare("DELETE FROM match_decisions WHERE id = ? AND match_id = ?").bind(decisionId, matchId),
    auditStmt(db, user, { action: "decision.remove", entity: "match", entityId: matchId, before: { id: decisionId, ...row }, countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Observer reports
 * ------------------------------------------------------------------ */

const FROM = "FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id";
const COLS = `a.id, a.match_id AS matchId, a.referee_id AS refereeId, a.observer_id AS observerId, a.state, a.filed_hours_after AS filedHoursAfter,
  a.filed_at AS filedAt, a.published, a.overall, a.marks, a.notes, a.clips, c.country_code AS countryCode`;

type AssessmentRow = {
  id: string; matchId: string; refereeId: string; observerId: string; state: string; published: number; countryCode: string | null;
  filedHoursAfter: number | null; filedAt: string | null; overall: number; marks: string; notes: string; clips: string;
};

const toAssessment = (r: AssessmentRow) => ({ ...r, published: r.published === 1, marks: json(r.marks, {}), notes: json<Localized>(r.notes, { fr: "", en: "" }), clips: json(r.clips, []) });

async function loadAssessment(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT ${COLS} ${FROM} WHERE a.id = ?`).bind(id).first<AssessmentRow>();
  if (!row) throw notFound("Assessment");
  return row;
}

assessments.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ refereeId: z.string().optional(), state: z.enum(["filed", "draft", "overdue"]).optional(), matchId: z.string().optional(), country: countryParam.optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    const scope = countryFilter(user, "c.country_code");
    where.push(scope.sql);
    args.push(...scope.params);
    if (q.country) (where.push("c.country_code = ?"), args.push(q.country));
    if (q.refereeId) (where.push("a.referee_id = ?"), args.push(q.refereeId));
  } else {
    if (!user.officialId) throw forbidden();
    // A referee sees the reports they wrote as observer, and reports about them only once the federation has released them.
    where.push("((a.referee_id = ? AND a.published = 1 AND a.state = 'filed') OR a.observer_id = ?)");
    args.push(user.officialId, user.officialId);
    if (q.refereeId) (where.push("a.referee_id = ?"), args.push(q.refereeId));
  }
  if (q.state) (where.push("a.state = ?"), args.push(q.state));
  if (q.matchId) (where.push("a.match_id = ?"), args.push(q.matchId));
  const { results } = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(" AND ")} ORDER BY a.updated_at DESC LIMIT 300`)
    .bind(...args)
    .all<AssessmentRow>();
  return c.json({ assessments: results.map(toAssessment) });
});

const clipSchema = z.object({ minute: z.number().int().min(0).max(130), label: localizedText(120) });
const writeSchema = z.object({
  matchId: z.string().min(1),
  observerId: z.string().optional(),
  marks: z.record(z.string(), z.number().min(0).max(10)),
  notes: optionalText(4000).default({ fr: "", en: "" }),
  clips: z.array(clipSchema).max(20).default([]),
  state: z.enum(["draft", "filed"]).default("filed"),
});

/** Weighted mark on the grid, 0–10 with one decimal. */
function weighted(marks: Record<string, number>, grid: Criterion[]) {
  const total = grid.reduce((sum, c) => sum + (marks[c.key] ?? 0) * c.weight, 0) / 100;
  return Math.round(total * 10) / 10;
}

function checkMarks(marks: Record<string, number>, grid: Criterion[], needAll: boolean) {
  const known = new Set(grid.map((g) => g.key));
  const unknown = Object.keys(marks).filter((k) => !known.has(k));
  if (unknown.length) throw new ApiError(422, "unknown_criterion", "Marks contain criteria that are not on the grid", { unknown });
  const missing = grid.filter((g) => !(g.key in marks)).map((g) => g.key);
  if (needAll && missing.length) throw new ApiError(422, "marks_incomplete", "A filed report must mark every criterion", { missing });
}

/* ---- the referee's running figures, kept current from filed reports ---- */

/** The match's analytics figure (0 until the tracking feed has supplied one). */
const analyticsArps = (m: { arps_for_match: number | null }) => m.arps_for_match ?? 0;

/** ARPS observed from one report: the report's 0–100 mark, averaged with the match analytics when there are some. */
const observedArps = (reportScore: number, analytics: number) => Math.round((analytics > 0 ? (reportScore + analytics) / 2 : reportScore) * 10) / 10;

/**
 * Statements that bring the assessed referee's figures up to date.
 *
 * - Filing a report moves `rmcs_avg` and `arps` an exponential step (weight 0.1) towards the report; the very first
 *   observation of an official with no figures yet sets them. `trend` is the change in `rmcs_avg`.
 * - Correcting an already-filed report moves them by the same weight times the *difference* between the old and new
 *   report, so a correction is applied exactly once and never counted as a second observation.
 * - `matches` never goes down and is at least the number of finished matches on file; the match's own `rmcs`
 *   (the report's 0–100 mark) is written next to the analytics row.
 */
function performanceStmts(
  db: D1Database,
  m: { refereeId: string; matchId: string; arpsForMatch: number },
  overall: number,
  previousOverall: number | null,
) {
  const x = Math.round(overall * 100) / 10; // 0–10 → 0–100, one decimal
  const a = observedArps(x, m.arpsForMatch);
  const stats =
    previousOverall === null
      ? db
          .prepare(
            `UPDATE officials SET
               trend = ROUND(CASE WHEN rmcs_avg = 0 THEN 0 ELSE ?1 * 0.1 - rmcs_avg * 0.1 END, 1),
               rmcs_avg = ROUND(CASE WHEN rmcs_avg = 0 THEN ?1 ELSE rmcs_avg * 0.9 + ?1 * 0.1 END, 1),
               arps = ROUND(CASE WHEN arps = 0 THEN ?2 ELSE arps * 0.9 + ?2 * 0.1 END, 1),
               matches = MAX(matches, (SELECT COUNT(*) FROM matches WHERE referee_id = ?3 AND status = 'finished')),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?3`,
          )
          .bind(x, a, m.refereeId)
      : (() => {
          const px = Math.round(previousOverall * 100) / 10;
          const shiftR = 0.1 * (x - px);
          const shiftA = 0.1 * (a - observedArps(px, m.arpsForMatch));
          return db
            .prepare(
              `UPDATE officials SET
                 trend = ROUND(trend + ?1, 1),
                 rmcs_avg = MIN(100, MAX(0, ROUND(rmcs_avg + ?1, 1))),
                 arps = MIN(100, MAX(0, ROUND(arps + ?2, 1))),
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
               WHERE id = ?3`,
            )
            .bind(shiftR, shiftA, m.refereeId);
        })();
  return [
    stats,
    db
      .prepare(
        // `arps_for_match` stays the analytics feed's figure (0 until it supplies one); only `rmcs` comes from the report
        `INSERT INTO match_officiating (match_id, arps_for_match, rmcs, pressure_avg) VALUES (?1, 0, ?2, 0)
         ON CONFLICT (match_id) DO UPDATE SET rmcs = excluded.rmcs`,
      )
      .bind(m.matchId, x),
  ];
}

/**
 * Who may file or edit a report on a match:
 *  - an administrator;
 *  - a federation seat, for matches of its own country;
 *  - a referee-account whose official is designated OBS on that match's fixture — never a match they refereed.
 */
assessments.post("/", async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, writeSchema);
  const db = c.env.DB;
  const grid = await loadCriteria(db);
  checkMarks(b.marks, grid, b.state === "filed");

  if (!isStaff(user)) {
    const appointed =
      !!user.officialId &&
      !!(await db
        .prepare("SELECT 1 AS x FROM designations d JOIN matches m ON m.fixture_id = d.fixture_id WHERE m.id = ? AND d.role = 'OBS' AND d.official_id = ? AND d.state <> 'declined'")
        .bind(b.matchId, user.officialId)
        .first());
    // 403 whether or not the match exists: a referee learns nothing about matches they were not appointed to
    if (!appointed) throw forbidden("You were not appointed observer for this match");
  }

  const match = await db.prepare(`${MATCH_SQL} WHERE m.id = ?`).bind(b.matchId).first<MatchRow>();
  if (!match) throw notFound("Match");
  if (isStaff(user)) assertCountry(user, match.country_code, "Match");
  if (!match.referee_id) throw new ApiError(422, "no_referee", "This match has no referee on record to assess");

  let observerId: string;
  if (!isStaff(user)) {
    observerId = user.officialId!;
  } else {
    if (!b.observerId) throw new ApiError(422, "observer_required", "Say which observer wrote this report");
    const obs = await db.prepare("SELECT id, country_code FROM officials WHERE id = ?").bind(b.observerId).first<{ id: string; country_code: string }>();
    // a federation names observers of its own country only; an unknown or foreign id looks the same
    if (!obs || (!isAdmin(user) && !inCountry(user, obs.country_code))) throw new ApiError(422, "unknown_observer", "Unknown observer");
    observerId = obs.id;
  }
  if (observerId === match.referee_id) throw new ApiError(422, "self_assessment", "An official cannot assess their own match");

  const kickoff = Date.parse(match.match_date);
  const hours = b.state === "filed" ? (Number.isFinite(kickoff) ? Math.max(0, Math.round((Date.now() - kickoff) / 3_600_000)) : 0) : null;
  const id = `as-${uuid().slice(0, 12)}`;
  const overall = weighted(b.marks, grid);
  const countryCode = match.country_code;

  const stmts = [
    db
      .prepare(
        `INSERT INTO assessments (id, match_id, referee_id, observer_id, state, filed_hours_after, filed_at, overall, marks, notes, clips)
         VALUES (?, ?, ?, ?, ?, ?, ${b.state === "filed" ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"}, ?, ?, ?, ?)`,
      )
      .bind(id, b.matchId, match.referee_id, observerId, b.state, hours, overall, JSON.stringify(b.marks), JSON.stringify(b.notes), JSON.stringify(b.clips)),
    auditStmt(db, user, { action: `assessment.${b.state}`, entity: "assessment", entityId: id, after: { matchId: b.matchId, overall }, countryCode, ip: c.get("ip") }),
  ];
  if (b.state === "filed") {
    stmts.push(...performanceStmts(db, { refereeId: match.referee_id, matchId: b.matchId, arpsForMatch: analyticsArps(match) }, overall, null));
    if (!isStaff(user)) {
      stmts.push(
        ...notifyStmts(db, {
          ...staffNotice(countryCode),
          title: localized("Rapport d'évaluation déposé", "Assessment report filed"),
          detail: localized(`${match.home} – ${match.away} : note globale ${overall}/10, en attente de publication.`, `${match.home} – ${match.away}: overall mark ${overall}/10, awaiting release.`),
          tone: "var",
          href: "/assessments",
        }),
      );
    }
  }
  try {
    await db.batch(stmts);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "This observer already has a report for this match");
    throw err;
  }
  return c.json({ assessment: toAssessment(await loadAssessment(db, id)) }, 201);
});

const fileSchema = z.object({
  marks: z.record(z.string(), z.number().min(0).max(10)).optional(),
  notes: optionalText(4000).optional(),
  clips: z.array(clipSchema).max(20).optional(),
  file: z.boolean().default(false),
  reason: z.string().min(3).max(300).optional(),
});

assessments.patch("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, fileSchema);
  const db = c.env.DB;
  const row = await loadAssessment(db, id);
  if (isStaff(user)) assertCountry(user, row.countryCode, "Assessment");
  else if (!user.officialId || user.officialId !== row.observerId) throw notFound("Assessment"); // not theirs: it does not exist for them
  // a filed report is a record: only staff may correct it, and must say why
  if (row.state === "filed") {
    if (!isStaff(user)) throw forbidden("A filed report can only be corrected by the federation");
    if (!b.reason) throw new ApiError(422, "reason_required", "Correcting a filed report needs a written reason");
  }

  const grid = await loadCriteria(db);
  const marks = b.marks ?? json<Record<string, number>>(row.marks, {});
  const filing = b.file && row.state !== "filed";
  checkMarks(marks, grid, filing || row.state === "filed");
  const overall = weighted(marks, grid);

  const stmts = [
    db
      .prepare(
        `UPDATE assessments SET marks = ?, notes = ?, clips = ?, overall = ?, state = ?, ${filing ? "filed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')," : ""} updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .bind(JSON.stringify(marks), JSON.stringify(b.notes ?? json(row.notes, { fr: "", en: "" })), JSON.stringify(b.clips ?? json(row.clips, [])), overall, filing ? "filed" : row.state, id),
    auditStmt(db, user, { action: filing ? "assessment.file" : "assessment.edit", entity: "assessment", entityId: id, before: { overall: row.overall, state: row.state }, after: { overall }, reason: b.reason, countryCode: row.countryCode, ip: c.get("ip") }),
  ];
  if (filing || row.state === "filed") {
    const analytics = await db.prepare("SELECT arps_for_match AS a FROM match_officiating WHERE match_id = ?").bind(row.matchId).first<{ a: number }>();
    stmts.push(...performanceStmts(db, { refereeId: row.refereeId, matchId: row.matchId, arpsForMatch: analytics?.a ?? 0 }, overall, filing ? null : row.overall));
  }
  await db.batch(stmts);
  return c.json({ assessment: toAssessment(await loadAssessment(db, id)) });
});

// Reports are confidential until the federation releases them to the referee.
assessments.post("/:id/publish", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const row = await loadAssessment(db, id);
  assertCountry(user, row.countryCode, "Assessment");
  if (row.state !== "filed") throw new ApiError(409, "not_filed", "Only a filed report can be released");
  if (row.published === 1) return c.json({ ok: true, changed: false });
  await db.batch([
    db.prepare("UPDATE assessments SET published = 1 WHERE id = ?").bind(id),
    auditStmt(db, user, { action: "assessment.publish", entity: "assessment", entityId: id, countryCode: row.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, row.refereeId, {
      title: localized("Une évaluation de match est disponible", "A match assessment is available"),
      detail: localized(`Note globale ${row.overall}/10.`, `Overall mark ${row.overall}/10.`),
      tone: "var",
      href: "/me",
    })),
  ]);
  return c.json({ ok: true, changed: true });
});

/* ------------------------------------------------------------------ *
 * Dossiers — the report pack sent to federations after a match
 * ------------------------------------------------------------------ */

/** The sections a dossier can hold, in print order. */
export const DOSSIER_SECTIONS = ["summary", "decisions", "positioning", "observer", "crew", "comparison"] as const;

dossiers.get("/", staff, async (c) => {
  const user = currentUser(c);
  const scope = countryFilter(user, "c.country_code");
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.match_id AS matchId, d.generated, d.pages, d.recipients, d.sections, c.country_code AS countryCode
       FROM dossiers d JOIN matches m ON m.id = d.match_id LEFT JOIN competitions c ON c.id = m.league_id
      WHERE ${scope.sql} ORDER BY d.generated DESC, d.id LIMIT 200`,
  )
    .bind(...scope.params)
    .all<{ recipients: string; sections: string } & Record<string, unknown>>();
  return c.json({ dossiers: results.map((d) => ({ ...d, recipients: json(d.recipients, []), sections: json(d.sections, []) })) });
});

/**
 * Everything the printable dossier shows, from the records themselves: the match and its decisions, the referee,
 * the crew, the filed observer reports against the grid, and who the federation is. Staff of the match's country.
 */
dossiers.get("/:id", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const d = await db
    .prepare(
      `SELECT d.id, d.match_id AS matchId, d.generated, d.pages, d.recipients, d.sections, c.country_code AS countryCode, u.name AS generatedBy
         FROM dossiers d JOIN matches m ON m.id = d.match_id LEFT JOIN competitions c ON c.id = m.league_id LEFT JOIN users u ON u.id = d.generated_by
        WHERE d.id = ?`,
    )
    .bind(c.req.param("id"))
    .first<{ id: string; matchId: string; generated: string; pages: number; recipients: string; sections: string; countryCode: string | null; generatedBy: string | null }>();
  if (!d) throw notFound("Dossier");
  assertCountry(user, d.countryCode, "Dossier");

  const m = (await db.prepare(`${MATCH_SQL} WHERE m.id = ?`).bind(d.matchId).first<MatchRow>())!;
  const [decisions, referee, crew, reports, competition, place] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT * FROM match_decisions WHERE match_id = ? ORDER BY minute").bind(d.matchId),
    db.prepare("SELECT id, name, level, country_code AS countryCode FROM officials WHERE id = ?").bind(m.referee_id ?? ""),
    db
      .prepare(
        `SELECT g.role, g.official_id AS officialId, o.name, g.state FROM designations g LEFT JOIN officials o ON o.id = g.official_id
          WHERE g.fixture_id = ? AND g.official_id IS NOT NULL ORDER BY CASE g.role WHEN 'R' THEN 0 WHEN 'AR1' THEN 1 WHEN 'AR2' THEN 2 WHEN 'FOURTH' THEN 3 ELSE 4 END, g.role`,
      )
      .bind(m.fixture_id ?? ""),
    db
      .prepare(
        `SELECT a.id, a.observer_id AS observerId, o.name AS observerName, a.overall, a.marks, a.notes, a.filed_at AS filedAt, a.published
           FROM assessments a LEFT JOIN officials o ON o.id = a.observer_id WHERE a.match_id = ? AND a.state = 'filed' ORDER BY a.filed_at, a.id`,
      )
      .bind(d.matchId),
    db.prepare("SELECT id, name, short_name AS shortName, season, tier FROM competitions WHERE id = ?").bind(m.competition_id ?? ""),
    db
      .prepare(
        `SELECT c.code, c.name, c.name_fr AS nameFr, c.name_es AS nameEs, c.name_de AS nameDe, f.code AS federation, f.name AS federationName
           FROM countries c LEFT JOIN federations f ON f.country = c.code WHERE c.code = ?`,
      )
      .bind(d.countryCode ?? ""),
  ]);
  const { decisions: _d, ...match } = toMatch(m, decisions.results as unknown as DecisionRow[], { withHeat: true });
  return c.json({
    dossier: { ...d, recipients: json(d.recipients, []), sections: json(d.sections, []) },
    match,
    decisions: (decisions.results as unknown as DecisionRow[]).map(toDecision),
    referee: referee.results[0] ?? null,
    crew: crew.results,
    reports: (reports.results as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      published: r.published === 1,
      marks: json(r.marks as string, {}),
      notes: json<Localized>(r.notes as string, { fr: "", en: "" }),
    })),
    criteria: await loadCriteria(db),
    competition: competition.results[0] ?? null,
    // continental ties are the platform's own: no national federation heads them
    country: place.results[0] ?? null,
  });
});

dossiers.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(
    c,
    z.object({
      matchId: z.string(),
      pages: z.number().int().min(1).max(200).default(12),
      recipients: z.array(z.string().max(80)).min(1).max(10),
      sections: z.array(z.enum(DOSSIER_SECTIONS)).max(DOSSIER_SECTIONS.length).default([...DOSSIER_SECTIONS]),
    }),
  );
  const db = c.env.DB;
  const countryCode = await matchCountry(db, b.matchId);
  assertCountry(user, countryCode, "Match");
  const id = `dos-${uuid().slice(0, 10)}`;
  await db.batch([
    db
      .prepare("INSERT INTO dossiers (id, match_id, generated, pages, recipients, sections, generated_by) VALUES (?, ?, date('now'), ?, ?, ?, ?)")
      .bind(id, b.matchId, b.pages, JSON.stringify(b.recipients), JSON.stringify(DOSSIER_SECTIONS.filter((s) => b.sections.includes(s))), user.id),
    auditStmt(db, user, { action: "dossier.generate", entity: "match", entityId: b.matchId, after: { recipients: b.recipients }, countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ id }, 201);
});
