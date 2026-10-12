import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { canActFor, isStaff } from "../lib/access";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { currentUser, staff } from "../middleware/auth";

export const incidents = new Hono<AppEnv>();
export const cases = new Hono<AppEnv>();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/* ------------------------------------------------------------------ *
 * Incidents — what is reported. A report alone never suspends anyone.
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
  // An official reports on themselves (an absence or delay); staff and observers report on anyone.
  const officialId = user.role === "referee" ? user.officialId : b.officialId;
  if (!officialId) throw new ApiError(422, "official_required", "Say which official this concerns");
  if (user.role === "referee" && !["absence", "lateness"].includes(b.kind)) throw forbidden("You can declare your own absence or delay");
  if (user.role === "observer" && b.officialId === user.officialId) throw forbidden("You cannot report on yourself");

  const id = `inc-${uuid().slice(0, 10)}`;
  const person = await db.prepare("SELECT name FROM officials WHERE id = ?").bind(officialId).first<{ name: string }>();
  if (!person) throw notFound("Official");
  try {
    await db.batch([
      db
        .prepare("INSERT INTO incidents (id, kind, official_id, fixture_id, severity, description, justified, reported_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, b.kind, officialId, b.fixtureId ?? null, b.severity, b.description, b.justified === undefined ? null : b.justified ? 1 : 0, user.id),
      auditStmt(db, user, { action: "incident.report", entity: "incident", entityId: id, after: { kind: b.kind, officialId, severity: b.severity }, ip: c.get("ip") }),
      ...notifyStmts(db, {
        audienceRole: "commission",
        dedupeKey: `incident:${id}`,
        title: { en: "Incident reported", fr: "Incident signalé" },
        detail: { en: `${person.name}: ${b.kind} — ${b.description.slice(0, 140)}`, fr: `${person.name} : ${b.kind} — ${b.description.slice(0, 140)}` },
        tone: b.severity === "minor" ? "amber" : "red",
        href: "/development",
      }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_reference", "Unknown fixture");
    throw err;
  }
  return c.json({ incident: { id, kind: b.kind, officialId, status: "open" } }, 201);
});

incidents.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ officialId: z.string().optional(), status: z.enum(["open", "reviewing", "closed"]).optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    if (q.officialId) (where.push("i.official_id = ?"), args.push(q.officialId));
  } else if (user.officialId) {
    (where.push("i.official_id = ?"), args.push(user.officialId));
  } else throw forbidden();
  if (q.status) (where.push("i.status = ?"), args.push(q.status));
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.kind, i.official_id AS officialId, o.name AS officialName, i.fixture_id AS fixtureId, i.severity, i.status, i.description, i.justified, i.reported_at AS reportedAt, i.closed_at AS closedAt
       FROM incidents i JOIN officials o ON o.id = i.official_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY i.reported_at DESC LIMIT 200`,
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
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (b.status) {
    sets.push("status = ?", `closed_at = ${b.status === "closed" ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"}`);
    args.push(b.status);
  }
  if (b.justified !== undefined) (sets.push("justified = ?"), args.push(b.justified ? 1 : 0));
  if (b.severity) (sets.push("severity = ?"), args.push(b.severity));
  if (sets.length === 0) return c.json({ ok: true });
  const res = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE incidents SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(c.env.DB, user, { action: "incident.update", entity: "incident", entityId: id, after: b, ip: c.get("ip") }),
  ]);
  if (res[0].meta.changes === 0) throw notFound("Incident");
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Disciplinary cases — opened, heard, decided, appealed, closed
 * ------------------------------------------------------------------ */

const CASE_COLS = `c.id, c.official_id AS officialId, o.name AS officialName, c.incident_id AS incidentId, c.status, c.summary,
  c.hearing_at AS hearingAt, c.decision, c.decision_ref AS decisionRef, c.sanction, c.suspension_from AS suspensionFrom,
  c.suspension_to AS suspensionTo, c.appeal_note AS appealNote, c.opened_at AS openedAt, c.decided_at AS decidedAt`;

interface CaseRow {
  id: string;
  officialId: string;
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

cases.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ officialId: z.string().optional(), status: z.string().optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    if (q.officialId) (where.push("c.official_id = ?"), args.push(q.officialId));
  } else if (user.officialId) {
    (where.push("c.official_id = ?"), args.push(user.officialId));
  } else throw forbidden();
  if (q.status) (where.push("c.status = ?"), args.push(q.status));
  const { results } = await c.env.DB.prepare(`SELECT ${CASE_COLS} FROM disciplinary_cases c JOIN officials o ON o.id = c.official_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.opened_at DESC LIMIT 200`)
    .bind(...args)
    .all();
  return c.json({ cases: results });
});

const openSchema = z.object({ officialId: z.string(), incidentId: z.string().optional(), summary: z.string().min(5).max(2000) });

cases.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, openSchema);
  const id = `case-${uuid().slice(0, 10)}`;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO disciplinary_cases (id, official_id, incident_id, summary, opened_by) VALUES (?, ?, ?, ?, ?)").bind(id, b.officialId, b.incidentId ?? null, b.summary, user.id),
      b.incidentId
        ? c.env.DB.prepare("UPDATE incidents SET status = 'reviewing' WHERE id = ? AND status = 'open'").bind(b.incidentId)
        : c.env.DB.prepare("SELECT 1"),
      auditStmt(c.env.DB, user, { action: "case.open", entity: "case", entityId: id, after: { officialId: b.officialId }, ip: c.get("ip") }),
      ...(await notifyOfficialStmts(c.env.DB, b.officialId, {
        title: { en: "A disciplinary procedure has been opened", fr: "Une procédure disciplinaire a été ouverte" },
        detail: { en: "You will be summoned to a hearing. You may appeal any decision.", fr: "Vous serez convoqué à une audition. Vous pourrez faire appel de toute décision." },
        tone: "red",
        href: "/me",
      })),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_reference", "Unknown official or incident");
    throw err;
  }
  return c.json({ case: await loadCase(c.env.DB, id) }, 201);
});

cases.post("/:id/hearing", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { hearingAt } = await readJson(c, z.object({ hearingAt: z.string().min(10).max(40) }));
  const row = await loadCase(c.env.DB, id);
  if (!["opened", "hearing_scheduled"].includes(row.status)) throw new ApiError(409, "bad_state", "A decided case cannot be given a new hearing");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE disciplinary_cases SET status = 'hearing_scheduled', hearing_at = ? WHERE id = ?").bind(hearingAt, id),
    auditStmt(c.env.DB, user, { action: "case.hearing", entity: "case", entityId: id, after: { hearingAt }, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(c.env.DB, row.officialId, {
      title: { en: "Hearing scheduled", fr: "Audition programmée" },
      detail: { en: `Your hearing is set for ${hearingAt}.`, fr: `Votre audition est fixée au ${hearingAt}.` },
      tone: "amber",
      href: "/me",
    })),
  ]);
  return c.json({ case: await loadCase(c.env.DB, id) });
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
  const row = await loadCase(db, id);
  if (row.status === "decided" || row.status === "closed") throw new ApiError(409, "bad_state", "This case already has a decision");

  const stmts = [
    db
      .prepare(
        `UPDATE disciplinary_cases SET status = 'decided', decision = ?, decision_ref = ?, sanction = ?, suspension_from = ?, suspension_to = ?,
           decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .bind(b.decision, b.decisionRef ?? null, b.sanction, b.suspensionFrom ?? null, b.suspensionTo ?? null, user.id, id),
    auditStmt(db, user, { action: "case.decide", entity: "case", entityId: id, after: { sanction: b.sanction, decisionRef: b.decisionRef, from: b.suspensionFrom, to: b.suspensionTo }, reason: b.decision, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, row.officialId, {
      title: { en: "Disciplinary decision", fr: "Décision disciplinaire" },
      detail: { en: `${b.sanction}: ${b.decision.slice(0, 160)}`, fr: `${b.sanction} : ${b.decision.slice(0, 160)}` },
      tone: "red",
      href: "/me",
    })),
  ];
  await db.batch(stmts);
  if (b.sanction === "removal") {
    await db.batch([
      db.prepare("UPDATE officials SET status = 'retired', status_before_suspension = NULL WHERE id = ?").bind(row.officialId),
      auditStmt(db, user, { action: "official.removed", entity: "official", entityId: row.officialId, reason: `case ${id}`, ip: c.get("ip") }),
    ]);
  }
  const affected = await syncSuspensions(db);
  const upcoming = await upcomingDesignations(db, row.officialId, b.suspensionFrom ?? today(), b.suspensionTo ?? "9999-12-31");
  // The commission decides what happens to those matches — nothing is reassigned behind its back.
  if (upcoming.length && (b.sanction === "suspension" || b.sanction === "removal")) {
    await db.batch(
      notifyStmts(db, {
        audienceRole: "commission",
        dedupeKey: `suspension-impact:${id}`,
        title: { en: "Replace a suspended official", fr: "Remplacer un officiel suspendu" },
        detail: { en: `${row.officialName} holds ${upcoming.length} designation(s) during the sanction.`, fr: `${row.officialName} a ${upcoming.length} désignation(s) pendant la sanction.` },
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
  if (!canActFor(user, row.officialId)) throw notFound("Case");
  if (row.status !== "decided") throw new ApiError(409, "bad_state", "Only a decided case can be appealed");
  await db.batch([
    db.prepare("UPDATE disciplinary_cases SET status = 'appealed', appeal_note = ? WHERE id = ?").bind(note, id),
    auditStmt(db, user, { action: "case.appeal", entity: "case", entityId: id, reason: note, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "commission",
      dedupeKey: `appeal:${id}`,
      title: { en: "Appeal filed", fr: "Recours déposé" },
      detail: { en: `${row.officialName} appealed the decision.`, fr: `${row.officialName} a fait appel de la décision.` },
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
  await loadCase(c.env.DB, id);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE disciplinary_cases SET status = 'closed' WHERE id = ?").bind(id),
    auditStmt(c.env.DB, user, { action: "case.close", entity: "case", entityId: id, reason: note, ip: c.get("ip") }),
  ]);
  await syncSuspensions(c.env.DB);
  return c.json({ case: await loadCase(c.env.DB, id) });
});

/* ------------------------------------------------------------------ *
 * Suspensions follow the calendar
 * ------------------------------------------------------------------ */

/**
 * Brings every official's status in line with the suspensions in force today:
 * suspends those whose window has started, and restores those whose window ended
 * to what they were before. Safe to run any number of times; the daily cron runs it too.
 */
export async function syncSuspensions(db: D1Database) {
  const now = today();
  const changes: Array<{ officialId: string; to: string }> = [];

  const { results: shouldBe } = await db
    .prepare(
      `SELECT DISTINCT c.official_id AS officialId FROM disciplinary_cases c JOIN officials o ON o.id = c.official_id
        WHERE c.sanction = 'suspension' AND c.status IN ('decided', 'appealed') AND ?1 BETWEEN c.suspension_from AND c.suspension_to AND o.status <> 'suspended' AND o.status <> 'retired'`,
    )
    .bind(now)
    .all<{ officialId: string }>();
  for (const { officialId } of shouldBe) {
    await db.batch([
      db.prepare("UPDATE officials SET status_before_suspension = status, status = 'suspended' WHERE id = ? AND status <> 'suspended'").bind(officialId),
      auditStmt(db, null, { action: "official.suspended", entity: "official", entityId: officialId }),
    ]);
    changes.push({ officialId, to: "suspended" });
  }

  const { results: over } = await db
    .prepare(
      `SELECT o.id AS officialId, COALESCE(o.status_before_suspension, 'active') AS restoreTo FROM officials o
        WHERE o.status = 'suspended' AND NOT EXISTS (
          SELECT 1 FROM disciplinary_cases c WHERE c.official_id = o.id AND c.sanction = 'suspension' AND c.status IN ('decided', 'appealed') AND ?1 BETWEEN c.suspension_from AND c.suspension_to)`,
    )
    .bind(now)
    .all<{ officialId: string; restoreTo: string }>();
  for (const { officialId, restoreTo } of over) {
    await db.batch([
      db.prepare("UPDATE officials SET status = ?, status_before_suspension = NULL WHERE id = ? AND status = 'suspended'").bind(restoreTo, officialId),
      auditStmt(db, null, { action: "official.reinstated", entity: "official", entityId: officialId, after: { status: restoreTo } }),
      ...(await notifyOfficialStmts(db, officialId, {
        title: { en: "Suspension ended", fr: "Suspension terminée" },
        detail: { en: "You are back on the appointment list.", fr: "Vous êtes de nouveau désignable." },
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
      `SELECT f.id AS fixtureId, f.date, f.home, f.away, d.role FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE d.official_id = ? AND f.played = 0 AND f.date BETWEEN ? AND ? ORDER BY f.date`,
    )
    .bind(officialId, from, to)
    .all();
  return results;
}
