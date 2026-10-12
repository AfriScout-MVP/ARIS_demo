import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { isStaff } from "../lib/access";
import { notifyOfficialStmts } from "../lib/notify";
import { currentUser, requireRole, staff } from "../middleware/auth";
import { json } from "../domain/mappers";

export const assessments = new Hono<AppEnv>();
export const matches = new Hono<AppEnv>();
export const criteria = new Hono<AppEnv>();
export const dossiers = new Hono<AppEnv>();

/* ------------------------------------------------------------------ *
 * The evaluation grid — configurable, weights total 100
 * ------------------------------------------------------------------ */

interface Criterion {
  key: string;
  label: { en: string; fr: string };
  weight: number;
}

async function loadCriteria(db: D1Database): Promise<Criterion[]> {
  const { results } = await db.prepare("SELECT key, label, weight FROM evaluation_criteria ORDER BY sort, key").all<{ key: string; label: string; weight: number }>();
  return results.map((r) => ({ key: r.key, label: json(r.label, { en: r.key, fr: r.key }), weight: r.weight }));
}

criteria.get("/", async (c) => c.json({ criteria: await loadCriteria(c.env.DB) }));

const gridSchema = z
  .array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,30}$/), label: z.object({ en: z.string().min(1).max(80), fr: z.string().min(1).max(80) }), weight: z.number().int().min(1).max(100) }))
  .min(2)
  .max(12)
  .refine((rows) => rows.reduce((s, r) => s + r.weight, 0) === 100, { message: "Weights must total 100" })
  .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, { message: "Criterion keys must be unique" });

// A published grid is an official scale: changing it is an administrator's act, and it is logged.
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
  const q = parseQuery(c, z.object({ refereeId: z.string().optional(), limit: z.coerce.number().int().min(1).max(300).default(100) }));
  const refereeId = isStaff(user) || user.role === "observer" ? q.refereeId : user.officialId;
  if (!isStaff(user) && user.role !== "observer" && !refereeId) throw forbidden();
  const { results } = await c.env.DB.prepare(
    `SELECT id, fixture_id AS fixtureId, home, away, competition_id AS competitionId, country_code AS countryCode, date, score, referee_id AS refereeId,
            arps_for_match AS arpsForMatch, rmcs, pressure_avg AS pressureAvg
       FROM matches ${refereeId ? "WHERE referee_id = ?" : ""} ORDER BY date DESC LIMIT ?`,
  )
    .bind(...(refereeId ? [refereeId, q.limit] : [q.limit]))
    .all();
  return c.json({ matches: results });
});

matches.get("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const m = await db.prepare("SELECT * FROM matches WHERE id = ?").bind(id).first<{ referee_id: string; physical: string; pressure_timeline: string } & Record<string, unknown>>();
  if (!m) throw notFound("Match");
  if (!isStaff(user) && user.role !== "observer" && user.officialId !== m.referee_id) throw notFound("Match");
  const { results } = await db
    .prepare(
      `SELECT id, minute, type, description, initial_call AS initialCall, var_review AS varReview, final_call AS finalCall, confidence,
              pressure_index AS pressureIndex, distance, players FROM match_decisions WHERE match_id = ? ORDER BY minute`,
    )
    .bind(id)
    .all<{ description: string; players: string; varReview: number } & Record<string, unknown>>();
  return c.json({
    match: { ...m, physical: json(m.physical, {}), pressureTimeline: json(m.pressure_timeline, []) },
    decisions: results.map((d) => ({ ...d, description: json(d.description, {}), players: json(d.players, []), varReview: d.varReview === 1 })),
  });
});

const decisionSchema = z.object({
  minute: z.number().int().min(0).max(130),
  type: z.enum(["Penalty", "Red Card", "Yellow Card", "Offside", "Handball", "Foul"]),
  description: z.object({ en: z.string().min(1).max(300), fr: z.string().min(1).max(300) }),
  initialCall: z.enum(["given", "not-given"]),
  varReview: z.boolean().default(false),
  finalCall: z.enum(["confirmed", "overturned"]),
  confidence: z.number().min(0).max(100).default(0),
  pressureIndex: z.number().min(0).max(100).default(0),
  distance: z.number().min(0).max(120).default(0),
  players: z.array(z.string().max(80)).max(6).default([]),
});

matches.post("/:id/decisions", staff, async (c) => {
  const user = currentUser(c);
  const matchId = c.req.param("id");
  const b = await readJson(c, decisionSchema);
  const id = uuid();
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare("INSERT INTO match_decisions (id, match_id, minute, type, description, initial_call, var_review, final_call, confidence, pressure_index, distance, players) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, matchId, b.minute, b.type, JSON.stringify(b.description), b.initialCall, b.varReview ? 1 : 0, b.finalCall, b.confidence, b.pressureIndex, b.distance, JSON.stringify(b.players)),
      auditStmt(c.env.DB, user, { action: "decision.log", entity: "match", entityId: matchId, after: { minute: b.minute, type: b.type }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw notFound("Match");
    throw err;
  }
  return c.json({ id }, 201);
});

/* ------------------------------------------------------------------ *
 * Observer reports
 * ------------------------------------------------------------------ */

const COLS = `a.id, a.match_id AS matchId, a.referee_id AS refereeId, a.observer_id AS observerId, a.state, a.filed_hours_after AS filedHoursAfter,
  a.filed_at AS filedAt, a.published, a.overall, a.marks, a.notes, a.clips`;

type AssessmentRow = {
  id: string; matchId: string; refereeId: string; observerId: string; state: string; published: number;
  filedHoursAfter: number | null; overall: number; marks: string; notes: string; clips: string;
};

const toAssessment = (r: AssessmentRow) => ({ ...r, published: r.published === 1, marks: json(r.marks, {}), notes: json(r.notes, {}), clips: json(r.clips, []) });

assessments.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ refereeId: z.string().optional(), state: z.enum(["filed", "draft", "overdue"]).optional(), matchId: z.string().optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    if (q.refereeId) (where.push("a.referee_id = ?"), args.push(q.refereeId));
  } else if (user.role === "observer") {
    // an observer sees the reports they wrote
    (where.push("a.observer_id = ?"), args.push(user.officialId ?? ""));
  } else {
    // a referee sees only their own reports, and only once the commission has released them
    (where.push("a.referee_id = ?", "a.published = 1", "a.state = 'filed'"), args.push(user.officialId ?? ""));
  }
  if (q.state) (where.push("a.state = ?"), args.push(q.state));
  if (q.matchId) (where.push("a.match_id = ?"), args.push(q.matchId));
  const { results } = await c.env.DB.prepare(`SELECT ${COLS} FROM assessments a ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.updated_at DESC LIMIT 300`)
    .bind(...args)
    .all<AssessmentRow>();
  return c.json({ assessments: results.map(toAssessment) });
});

const writeSchema = z.object({
  matchId: z.string().min(1),
  observerId: z.string().optional(),
  marks: z.record(z.string(), z.number().min(0).max(10)),
  notes: z.object({ en: z.string().max(4000).default(""), fr: z.string().max(4000).default("") }).default({ en: "", fr: "" }),
  clips: z.array(z.object({ minute: z.number().int().min(0).max(130), label: z.object({ en: z.string().max(120), fr: z.string().max(120) }) })).max(20).default([]),
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

assessments.post("/", requireRole("admin", "commission", "observer"), async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, writeSchema);
  const db = c.env.DB;
  const grid = await loadCriteria(db);
  checkMarks(b.marks, grid, b.state === "filed");

  const match = await db
    .prepare("SELECT m.id, m.referee_id AS refereeId, m.date, f.kickoff FROM matches m LEFT JOIN fixtures f ON f.id = m.fixture_id WHERE m.id = ?")
    .bind(b.matchId)
    .first<{ id: string; refereeId: string; date: string; kickoff: string | null }>();
  if (!match) throw notFound("Match");

  const observerId = user.role === "observer" ? user.officialId : b.observerId;
  if (!observerId) throw new ApiError(422, "observer_required", "Say which observer wrote this report");
  if (observerId === match.refereeId) throw new ApiError(422, "self_assessment", "An official cannot assess their own match");
  if (user.role === "observer") {
    // an observer writes about matches they were appointed to
    const appointed = await db
      .prepare("SELECT 1 AS x FROM designations d JOIN matches m ON m.fixture_id = d.fixture_id WHERE m.id = ? AND d.role = 'OBS' AND d.official_id = ?")
      .bind(b.matchId, observerId)
      .first();
    if (!appointed) throw forbidden("You were not appointed observer for this match");
  }

  const kickoff = new Date(`${match.date}T${match.kickoff ?? "12:00"}:00Z`).getTime();
  const hours = b.state === "filed" ? Math.max(0, Math.round((Date.now() - kickoff) / 3_600_000)) : null;
  const id = `as-${uuid().slice(0, 12)}`;
  const overall = weighted(b.marks, grid);

  const stmts = [
    db
      .prepare(
        `INSERT INTO assessments (id, match_id, referee_id, observer_id, state, filed_hours_after, filed_at, overall, marks, notes, clips)
         VALUES (?, ?, ?, ?, ?, ?, ${b.state === "filed" ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"}, ?, ?, ?, ?)`,
      )
      .bind(id, b.matchId, match.refereeId, observerId, b.state, hours, overall, JSON.stringify(b.marks), JSON.stringify(b.notes), JSON.stringify(b.clips)),
    auditStmt(db, user, { action: `assessment.${b.state}`, entity: "assessment", entityId: id, after: { matchId: b.matchId, overall }, ip: c.get("ip") }),
  ];
  if (b.state === "filed") stmts.push(...ratingUpdate(db, match.refereeId, overall));
  try {
    await db.batch(stmts);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "This observer already has a report for this match");
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_observer", "Unknown observer");
    throw err;
  }
  const row = await db.prepare(`SELECT ${COLS} FROM assessments a WHERE a.id = ?`).bind(id).first<AssessmentRow>();
  return c.json({ assessment: toAssessment(row!) }, 201);
});

/**
 * A filed report nudges the referee's rating: an exponential moving average
 * (weight 0.1) of the report's 0–100 equivalent. ARPS and the match-analytics
 * figures come from the analytics feed and are not touched here.
 */
function ratingUpdate(db: D1Database, refereeId: string, overall: number) {
  return [
    db
      .prepare("UPDATE officials SET trend = ROUND(?1 * 10 * 0.1 + rmcs_avg * 0.9 - rmcs_avg, 1), rmcs_avg = ROUND(rmcs_avg * 0.9 + ?1 * 10 * 0.1, 1), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?2")
      .bind(overall, refereeId),
  ];
}

const fileSchema = z.object({
  marks: z.record(z.string(), z.number().min(0).max(10)).optional(),
  notes: z.object({ en: z.string().max(4000), fr: z.string().max(4000) }).optional(),
  clips: writeSchema.shape.clips.optional(),
  file: z.boolean().default(false),
  reason: z.string().min(3).max(300).optional(),
});

assessments.patch("/:id", requireRole("admin", "commission", "observer"), async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, fileSchema);
  const db = c.env.DB;
  const row = await db.prepare(`SELECT ${COLS} FROM assessments a WHERE a.id = ?`).bind(id).first<AssessmentRow>();
  if (!row) throw notFound("Assessment");
  const authored = user.officialId !== null && user.officialId === row.observerId;
  if (!isStaff(user) && !authored) throw notFound("Assessment");
  // a filed report is a record: only the commission may correct it, and must say why
  if (row.state === "filed") {
    if (!isStaff(user)) throw forbidden("A filed report can only be corrected by the commission");
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
      .bind(JSON.stringify(marks), JSON.stringify(b.notes ?? json(row.notes, {})), JSON.stringify(b.clips ?? json(row.clips, [])), overall, filing ? "filed" : row.state, id),
    auditStmt(db, user, { action: filing ? "assessment.file" : "assessment.edit", entity: "assessment", entityId: id, before: { overall: row.overall, state: row.state }, after: { overall }, reason: b.reason, ip: c.get("ip") }),
  ];
  if (filing) stmts.push(...ratingUpdate(db, row.refereeId, overall));
  await db.batch(stmts);
  const after = await db.prepare(`SELECT ${COLS} FROM assessments a WHERE a.id = ?`).bind(id).first<AssessmentRow>();
  return c.json({ assessment: toAssessment(after!) });
});

// Reports are confidential until the commission releases them to the referee.
assessments.post("/:id/publish", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const row = await db.prepare(`SELECT ${COLS} FROM assessments a WHERE a.id = ?`).bind(id).first<AssessmentRow>();
  if (!row) throw notFound("Assessment");
  if (row.state !== "filed") throw new ApiError(409, "not_filed", "Only a filed report can be released");
  if (row.published === 1) return c.json({ ok: true, changed: false });
  await db.batch([
    db.prepare("UPDATE assessments SET published = 1 WHERE id = ?").bind(id),
    auditStmt(db, user, { action: "assessment.publish", entity: "assessment", entityId: id, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, row.refereeId, {
      title: { en: "A match assessment is available", fr: "Une évaluation de match est disponible" },
      detail: { en: `Overall mark ${row.overall}/10.`, fr: `Note globale ${row.overall}/10.` },
      tone: "var",
      href: "/me",
    })),
  ]);
  return c.json({ ok: true, changed: true });
});

/* ------------------------------------------------------------------ *
 * Dossiers — the report pack sent to federations after a match
 * ------------------------------------------------------------------ */

dossiers.get("/", staff, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, match_id AS matchId, generated, pages, recipients FROM dossiers ORDER BY generated DESC LIMIT 200").all<{ recipients: string } & Record<string, unknown>>();
  return c.json({ dossiers: results.map((d) => ({ ...d, recipients: json(d.recipients, []) })) });
});

dossiers.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, z.object({ matchId: z.string(), pages: z.number().int().min(1).max(200).default(12), recipients: z.array(z.string().max(80)).min(1).max(10) }));
  const id = `dos-${uuid().slice(0, 10)}`;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO dossiers (id, match_id, generated, pages, recipients, generated_by) VALUES (?, ?, date('now'), ?, ?, ?)").bind(id, b.matchId, b.pages, JSON.stringify(b.recipients), user.id),
      auditStmt(c.env.DB, user, { action: "dossier.generate", entity: "match", entityId: b.matchId, after: { recipients: b.recipients }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw notFound("Match");
    throw err;
  }
  return c.json({ id }, 201);
});
