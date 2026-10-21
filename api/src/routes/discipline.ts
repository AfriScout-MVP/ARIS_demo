import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, assertReadOfficial, countryFilter, isStaff } from "../lib/access";
import { localized } from "../lib/localized";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { currentUser, staff } from "../middleware/auth";
import { assertFixtureLink } from "../domain/official-links";

export const incidents = new Hono<AppEnv>();
export const cases = new Hono<AppEnv>();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const countryParam = z.string().length(3).transform((v) => v.toUpperCase());

/* ------------------------------------------------------------------ *
 * Incidents — what is reported. A report alone never suspends anyone.
 * An incident belongs to the country of the official it concerns.
 * ------------------------------------------------------------------ */

const incidentSchema = z.object({
  kind: z.enum(["absence", "lateness", "refusal", "incident"]),
  officialId: z.string().optional(),
  fixtureId: z.string().optional(),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
  description: z.string().min(5).max(2000),
  justified: z.boolean().optional(),
});

incidents.post("/", async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, incidentSchema);
  const db = c.env.DB;
  // An official reports on themselves only (their own absence or delay); staff report on officials of their country.
  const officialId = user.role === "referee" ? user.officialId : b.officialId;
  if (!officialId) throw new ApiError(422, "official_required", "Say which official this concerns");
  if (user.role === "referee" && !["absence", "lateness"].includes(b.kind)) throw forbidden("You can declare your own absence or delay");

  const access = await assertReadOfficial(db, user, officialId);
  if (b.fixtureId) await assertFixtureLink(db, b.fixtureId, officialId, access.countryCode);
  const person = await db.prepare("SELECT name FROM officials WHERE id = ?").bind(officialId).first<{ name: string }>();

  const id = `inc-${uuid().slice(0, 10)}`;
  await db.batch([
    db
      .prepare("INSERT INTO incidents (id, kind, official_id, fixture_id, severity, description, justified, reported_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, b.kind, officialId, b.fixtureId ?? null, b.severity, b.description, b.justified === undefined ? null : b.justified ? 1 : 0, user.id),
    auditStmt(db, user, { action: "incident.report", entity: "incident", entityId: id, after: { kind: b.kind, officialId, severity: b.severity }, countryCode: access.countryCode, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "federation",
      countryCode: access.countryCode,
      dedupeKey: `incident:${id}`,
      title: localized("Incident signalé", "Incident reported"),
      detail: localized(`${person!.name} : ${b.kind} — ${b.description.slice(0, 140)}`, `${person!.name}: ${b.kind} — ${b.description.slice(0, 140)}`),
      tone: b.severity === "minor" ? "amber" : "red",
      href: "/development",
    }),
  ]);
  return c.json({ incident: { id, kind: b.kind, officialId, status: "open" } }, 201);
});

const INCIDENT_COLS = `i.id, i.kind, i.official_id AS officialId, o.name AS officialName, o.country_code AS countryCode, i.fixture_id AS fixtureId, i.severity, i.status,
  i.description, i.justified, i.reported_at AS reportedAt, i.closed_at AS closedAt`;

incidents.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ officialId: z.string().optional(), status: z.enum(["open", "reviewing", "closed"]).optional(), country: countryParam.optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    const scope = countryFilter(user, "o.country_code");
    where.push(scope.sql);
    args.push(...scope.params);
    if (q.country) (where.push("o.country_code = ?"), args.push(q.country));
    if (q.officialId) (where.push("i.official_id = ?"), args.push(q.officialId));
  } else {
    if (!user.officialId) throw forbidden();
    (where.push("i.official_id = ?"), args.push(user.officialId));
  }
  if (q.status) (where.push("i.status = ?"), args.push(q.status));
  const { results } = await c.env.DB.prepare(
    `SELECT ${INCIDENT_COLS} FROM incidents i JOIN officials o ON o.id = i.official_id WHERE ${where.join(" AND ")} ORDER BY i.reported_at DESC LIMIT 200`,
  )
    .bind(...args)
    .all();
  return c.json({ incidents: results });
});

const incidentPatch = z.object({ status: z.enum(["open", "reviewing", "closed"]).optional(), justified: z.boolean().optional(), severity: z.enum(["minor", "major", "critical"]).optional() });

incidents.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, incidentPatch);
  const db = c.env.DB;
  const row = await db
    .prepare("SELECT i.id, o.country_code AS countryCode FROM incidents i JOIN officials o ON o.id = i.official_id WHERE i.id = ?")
    .bind(id)
    .first<{ id: string; countryCode: string }>();
  if (!row) throw notFound("Incident");
  assertCountry(user, row.countryCode, "Incident");

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (b.status) {
    sets.push("status = ?", `closed_at = ${b.status === "closed" ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"}`);
    args.push(b.status);
  }
  if (b.justified !== undefined) (sets.push("justified = ?"), args.push(b.justified ? 1 : 0));
  if (b.severity) (sets.push("severity = ?"), args.push(b.severity));
  if (sets.length === 0) return c.json({ ok: true });
  await db.batch([
    db.prepare(`UPDATE incidents SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(db, user, { action: "incident.update", entity: "incident", entityId: id, after: b, countryCode: row.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Disciplinary cases — opened, heard, decided, appealed, closed
 * ------------------------------------------------------------------ */

const CASE_COLS = `c.id, c.official_id AS officialId, o.name AS officialName, o.country_code AS countryCode, c.incident_id AS incidentId, c.status, c.summary,
  c.hearing_at AS hearingAt, c.decision, c.decision_ref AS decisionRef, c.sanction, c.suspension_from AS suspensionFrom,
  c.suspension_to AS suspensionTo, c.appeal_note AS appealNote, c.opened_at AS openedAt, c.decided_at AS decidedAt`;

interface CaseRow {
  id: string;
  officialId: string;
  officialName: string;
  countryCode: string;
  status: string;
  sanction: string | null;
  suspensionFrom: string | null;
  suspensionTo: string | null;
}

async function loadCase(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT ${CASE_COLS} FROM disciplinary_cases c JOIN officials o ON o.id = c.official_id WHERE c.id = ?`).bind(id).first<CaseRow & Record<string, unknown>>();
  if (!row) throw notFound("Case");
  return row;
}

/** A case a staff member may act on: the federation's own country only (anything else does not exist for it). */
async function loadStaffCase(db: D1Database, user: ReturnType<typeof currentUser>, id: string) {
  const row = await loadCase(db, id);
  assertCountry(user, row.countryCode, "Case");
  return row;
}

cases.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ officialId: z.string().optional(), status: z.string().optional(), country: countryParam.optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    const scope = countryFilter(user, "o.country_code");
    where.push(scope.sql);
    args.push(...scope.params);
    if (q.country) (where.push("o.country_code = ?"), args.push(q.country));
    if (q.officialId) (where.push("c.official_id = ?"), args.push(q.officialId));
  } else {
    if (!user.officialId) throw forbidden();
    (where.push("c.official_id = ?"), args.push(user.officialId));
  }
  if (q.status) (where.push("c.status = ?"), args.push(q.status));
  const { results } = await c.env.DB.prepare(`SELECT ${CASE_COLS} FROM disciplinary_cases c JOIN officials o ON o.id = c.official_id WHERE ${where.join(" AND ")} ORDER BY c.opened_at DESC LIMIT 200`)
    .bind(...args)
    .all();
  return c.json({ cases: results });
});

const openSchema = z.object({ officialId: z.string(), incidentId: z.string().optional(), summary: z.string().min(5).max(2000) });

cases.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, openSchema);
  const db = c.env.DB;
  const access = await assertReadOfficial(db, user, b.officialId);
  if (b.incidentId) {
    // the incident must concern the same official (and so the same country)
    const inc = await db.prepare("SELECT 1 AS x FROM incidents WHERE id = ? AND official_id = ?").bind(b.incidentId, b.officialId).first();
    if (!inc) throw new ApiError(422, "unknown_reference", "Unknown incident for this official");
  }
  const id = `case-${uuid().slice(0, 10)}`;
  await db.batch([
    db.prepare("INSERT INTO disciplinary_cases (id, official_id, incident_id, summary, opened_by) VALUES (?, ?, ?, ?, ?)").bind(id, b.officialId, b.incidentId ?? null, b.summary, user.id),
    b.incidentId ? db.prepare("UPDATE incidents SET status = 'reviewing' WHERE id = ? AND status = 'open'").bind(b.incidentId) : db.prepare("SELECT 1"),
    auditStmt(db, user, { action: "case.open", entity: "case", entityId: id, after: { officialId: b.officialId }, countryCode: access.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, b.officialId, {
      title: localized("Une procédure disciplinaire a été ouverte", "A disciplinary procedure has been opened"),
      detail: localized(
        "Vous serez convoqué à une audition. Vous pourrez faire appel de toute décision.",
        "You will be summoned to a hearing. You may appeal any decision.",
      ),
      tone: "red",
      href: "/me",
    })),
  ]);
  return c.json({ case: await loadCase(db, id) }, 201);
});

cases.post("/:id/hearing", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { hearingAt } = await readJson(c, z.object({ hearingAt: z.string().min(10).max(40).refine((v) => !Number.isNaN(Date.parse(v)), "Use an ISO date or date-time") }));
  const db = c.env.DB;
  const row = await loadStaffCase(db, user, id);
  if (!["opened", "hearing_scheduled"].includes(row.status)) throw new ApiError(409, "bad_state", "A decided case cannot be given a new hearing");
  await db.batch([
    db.prepare("UPDATE disciplinary_cases SET status = 'hearing_scheduled', hearing_at = ? WHERE id = ?").bind(hearingAt, id),
    auditStmt(db, user, { action: "case.hearing", entity: "case", entityId: id, after: { hearingAt }, countryCode: row.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, row.officialId, {
      title: localized("Audition programmée", "Hearing scheduled"),
      detail: localized(`Votre audition est fixée au ${hearingAt}.`, `Your hearing is set for ${hearingAt}.`),
      tone: "amber",
      href: "/me",
    })),
  ]);
  return c.json({ case: await loadCase(db, id) });
});

const decideSchema = z
  .object({
    sanction: z.enum(["warning", "suspension", "removal", "none"]),
    decision: z.string().min(5).max(2000),
    // the reference of the official decision of the competent body — required for any suspension
    decisionRef: z.string().min(3).max(80).optional(),
    suspensionFrom: dateSchema.optional(),
    suspensionTo: dateSchema.optional(),
  })
  .refine((v) => v.sanction !== "suspension" || (v.decisionRef && v.suspensionFrom && v.suspensionTo), {
    message: "A suspension needs the decision reference and its start and end dates",
    path: ["decisionRef"],
  })
  .refine((v) => !v.suspensionFrom || !v.suspensionTo || v.suspensionTo >= v.suspensionFrom, { message: "The suspension cannot end before it starts", path: ["suspensionTo"] });

cases.post("/:id/decide", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, decideSchema);
  const db = c.env.DB;
  const row = await loadStaffCase(db, user, id);
  if (row.status === "decided" || row.status === "closed") throw new ApiError(409, "bad_state", "This case already has a decision");

  const stmts = [
    db
      .prepare(
        `UPDATE disciplinary_cases SET status = 'decided', decision = ?, decision_ref = ?, sanction = ?, suspension_from = ?, suspension_to = ?,
           decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .bind(b.decision, b.decisionRef ?? null, b.sanction, b.suspensionFrom ?? null, b.suspensionTo ?? null, user.id, id),
    auditStmt(db, user, {
      action: "case.decide",
      entity: "case",
      entityId: id,
      after: { sanction: b.sanction, decisionRef: b.decisionRef, from: b.suspensionFrom, to: b.suspensionTo },
      reason: b.decision,
      countryCode: row.countryCode,
      ip: c.get("ip"),
    }),
    ...(await notifyOfficialStmts(db, row.officialId, {
      title: localized("Décision disciplinaire", "Disciplinary decision"),
      detail: localized(`${b.sanction} : ${b.decision.slice(0, 160)}`, `${b.sanction}: ${b.decision.slice(0, 160)}`),
      tone: "red",
      href: "/me",
    })),
  ];
  if (b.sanction === "removal") {
    stmts.push(
      db.prepare("UPDATE officials SET status = 'retired', status_before_suspension = NULL WHERE id = ?").bind(row.officialId),
      auditStmt(db, user, { action: "official.removed", entity: "official", entityId: row.officialId, reason: `case ${id}`, countryCode: row.countryCode, ip: c.get("ip") }),
    );
  }
  await db.batch(stmts);

  // a suspension that has already started takes effect now; a future one waits for the daily job
  const affected = await syncSuspensions(db, row.officialId);
  const upcoming = await upcomingDesignations(db, row.officialId, b.suspensionFrom ?? today(), b.suspensionTo ?? "9999-12-31");
  // The federation decides what happens to those matches — nothing is reassigned behind its back.
  if (upcoming.length && (b.sanction === "suspension" || b.sanction === "removal")) {
    await db.batch(
      notifyStmts(db, {
        audienceRole: "federation",
        countryCode: row.countryCode,
        dedupeKey: `suspension-impact:${id}`,
        title: localized("Remplacer un officiel suspendu", "Replace a suspended official"),
        detail: localized(
          `${row.officialName} a ${upcoming.length} désignation(s) pendant la sanction.`,
          `${row.officialName} holds ${upcoming.length} designation(s) during the sanction.`,
        ),
        tone: "red",
        href: "/calendar",
      }),
    );
  }
  return c.json({ case: await loadCase(db, id), affectedDesignations: upcoming, statusChanges: affected });
});

cases.post("/:id/appeal", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { note } = await readJson(c, z.object({ note: z.string().min(5).max(2000) }));
  const db = c.env.DB;
  const row = await loadCase(db, id);
  // the official appeals their own decision; a federation seat may file it for an official of its country
  if (isStaff(user)) assertCountry(user, row.countryCode, "Case");
  else if (!user.officialId || user.officialId !== row.officialId) throw notFound("Case");
  if (row.status !== "decided") throw new ApiError(409, "bad_state", "Only a decided case can be appealed");
  await db.batch([
    db.prepare("UPDATE disciplinary_cases SET status = 'appealed', appeal_note = ? WHERE id = ?").bind(note, id),
    auditStmt(db, user, { action: "case.appeal", entity: "case", entityId: id, reason: note, countryCode: row.countryCode, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "federation",
      countryCode: row.countryCode,
      dedupeKey: `appeal:${id}`,
      title: localized("Recours déposé", "Appeal filed"),
      detail: localized(`${row.officialName} a fait appel de la décision.`, `${row.officialName} appealed the decision.`),
      tone: "amber",
      href: "/development",
    }),
  ]);
  return c.json({ case: await loadCase(db, id) });
});

cases.post("/:id/close", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { note } = await readJson(c, z.object({ note: z.string().min(3).max(1000) }));
  const db = c.env.DB;
  const row = await loadStaffCase(db, user, id);
  await db.batch([
    db.prepare("UPDATE disciplinary_cases SET status = 'closed' WHERE id = ?").bind(id),
    auditStmt(db, user, { action: "case.close", entity: "case", entityId: id, reason: note, countryCode: row.countryCode, ip: c.get("ip") }),
  ]);
  await syncSuspensions(db, row.officialId);
  return c.json({ case: await loadCase(db, id) });
});

/* ------------------------------------------------------------------ *
 * Suspensions follow the calendar
 * ------------------------------------------------------------------ */

/**
 * Brings officials' status in line with the suspensions in force today:
 * suspends those whose window has started, and restores those whose window ended
 * to what they were before. Safe to run any number of times; the daily cron runs it
 * for everyone (no argument), a decision or a closure runs it for the one official concerned.
 */
export async function syncSuspensions(db: D1Database, onlyOfficialId?: string) {
  const now = today();
  const only = onlyOfficialId ?? null;
  const changes: Array<{ officialId: string; to: string }> = [];

  const { results: shouldBe } = await db
    .prepare(
      `SELECT DISTINCT c.official_id AS officialId, o.country_code AS countryCode FROM disciplinary_cases c JOIN officials o ON o.id = c.official_id
        WHERE c.sanction = 'suspension' AND c.status IN ('decided', 'appealed') AND ?1 BETWEEN c.suspension_from AND c.suspension_to
          AND o.status <> 'suspended' AND o.status <> 'retired' AND (?2 IS NULL OR o.id = ?2)`,
    )
    .bind(now, only)
    .all<{ officialId: string; countryCode: string }>();
  for (const { officialId, countryCode } of shouldBe) {
    await db.batch([
      db.prepare("UPDATE officials SET status_before_suspension = status, status = 'suspended' WHERE id = ? AND status <> 'suspended'").bind(officialId),
      auditStmt(db, null, { action: "official.suspended", entity: "official", entityId: officialId, countryCode }),
    ]);
    changes.push({ officialId, to: "suspended" });
  }

  const { results: over } = await db
    .prepare(
      `SELECT o.id AS officialId, o.country_code AS countryCode, COALESCE(o.status_before_suspension, 'active') AS restoreTo FROM officials o
        WHERE o.status = 'suspended' AND (?2 IS NULL OR o.id = ?2) AND NOT EXISTS (
          SELECT 1 FROM disciplinary_cases c WHERE c.official_id = o.id AND c.sanction = 'suspension' AND c.status IN ('decided', 'appealed') AND ?1 BETWEEN c.suspension_from AND c.suspension_to)`,
    )
    .bind(now, only)
    .all<{ officialId: string; countryCode: string; restoreTo: string }>();
  for (const { officialId, countryCode, restoreTo } of over) {
    await db.batch([
      db.prepare("UPDATE officials SET status = ?, status_before_suspension = NULL WHERE id = ? AND status = 'suspended'").bind(restoreTo, officialId),
      auditStmt(db, null, { action: "official.reinstated", entity: "official", entityId: officialId, after: { status: restoreTo }, countryCode }),
      ...(await notifyOfficialStmts(db, officialId, {
        title: localized("Suspension terminée", "Suspension ended"),
        detail: localized("Vous êtes de nouveau désignable.", "You are back on the appointment list."),
        tone: "pitch",
        href: "/me",
        dedupeKey: `reinstated:${officialId}:${now}`,
      })),
    ]);
    changes.push({ officialId, to: restoreTo });
  }
  return changes;
}

async function upcomingDesignations(db: D1Database, officialId: string, from: string, to: string) {
  const { results } = await db
    .prepare(
      `SELECT f.id AS fixtureId, f.date, ht.name AS home, aw.name AS away, d.role
         FROM designations d JOIN fixtures f ON f.id = d.fixture_id JOIN teams ht ON ht.id = f.home_team_id JOIN teams aw ON aw.id = f.away_team_id
        WHERE d.official_id = ? AND d.state <> 'declined' AND f.status = 'scheduled' AND f.date BETWEEN ? AND ? ORDER BY f.date`,
    )
    .bind(officialId, from, to)
    .all();
  return results;
}
