import { Hono } from "hono";
import { z } from "zod";
import { candidatesForSlot } from "@core/engine";
import type { CrewRole } from "@core/types";
import type { AppEnv, AuthUser } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { isStaff } from "../lib/access";
import { notifyStmts, notifyOfficialStmts, type Bilingual } from "../lib/notify";
import { currentUser, inScope, staff } from "../middleware/auth";
import { DbEngineContext, loadFixtures, type LoadedFixture } from "../domain/engine-ctx";
import { assertEligible, requiredSlots, slotChangeStmts, slotOf } from "../domain/designations";

export const fixtures = new Hono<AppEnv>();

const ROLES = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"] as const;
const roleSchema = z.enum(ROLES);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const ROLE_LABEL: Record<CrewRole, Bilingual> = {
  R: { en: "Referee", fr: "Arbitre central" },
  AR1: { en: "Assistant referee 1", fr: "Arbitre assistant 1" },
  AR2: { en: "Assistant referee 2", fr: "Arbitre assistant 2" },
  FOURTH: { en: "Fourth official", fr: "Quatrième arbitre" },
  VAR: { en: "VAR", fr: "VAR" },
  AVAR: { en: "Assistant VAR", fr: "Assistant VAR" },
  OBS: { en: "Observer", fr: "Observateur" },
};

const matchLine = (f: LoadedFixture) => `${f.home} – ${f.away}, ${f.date} ${f.kickoff}, ${f.venue} (${f.city})`;

export function fixtureDto(f: LoadedFixture) {
  return {
    id: f.id,
    countryCode: f.countryCode,
    competitionId: f.competitionId,
    matchday: f.matchday,
    date: f.date,
    kickoff: f.kickoff,
    home: f.home,
    away: f.away,
    homeCode: f.homeCode,
    awayCode: f.awayCode,
    city: f.city,
    venue: f.venue,
    importance: f.importance,
    risk: f.risk,
    played: f.played,
    designationStatus: f.designationStatus,
    crew: f.crew,
  };
}

async function loadOne(db: D1Database, id: string) {
  const [fixture] = await loadFixtures(db, { ids: [id] });
  if (!fixture) throw notFound("Fixture");
  return fixture;
}

async function zoneLookup(db: D1Database) {
  const { results } = await db.prepare("SELECT code, zone FROM countries").all<{ code: string; zone: string }>();
  const map = new Map(results.map((r) => [r.code, r.zone]));
  return (code: string) => map.get(code);
}

/** Staff may only run the fixtures their account's scope covers. */
async function assertManage(db: D1Database, user: AuthUser, fixture: { countryCode: string }) {
  if (user.role === "admin" || user.scope === "all") return;
  if (!inScope(user, fixture.countryCode, await zoneLookup(db))) {
    throw forbidden("This fixture is outside the scope of your account");
  }
}

const RESCHEDULABLE = ["validated", "published"];

/* ------------------------------------------------------------------ *
 * Listing & creating
 * ------------------------------------------------------------------ */

const listQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  country: z.string().max(3).optional(),
  competition: z.string().max(60).optional(),
  status: z.enum(["draft", "awaiting_confirmation", "validated", "published"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300),
});

fixtures.get("/", async (c) => {
  const user = currentUser(c);
  if (user.role === "referee") throw forbidden("Use /me/designations for your own matches");
  const q = parseQuery(c, listQuery);
  let list = await loadFixtures(c.env.DB, { from: q.from, to: q.to, country: q.country?.toUpperCase() });
  if (q.competition) list = list.filter((f) => f.competitionId === q.competition);
  if (q.status) list = list.filter((f) => f.designationStatus === q.status);
  return c.json({ fixtures: list.slice(0, q.limit).map(fixtureDto), total: list.length });
});

const createSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/).optional(),
    countryCode: z.string().min(2).max(3),
    competitionId: z.string().min(1).max(60),
    matchday: z.number().int().min(1).max(100),
    date: dateSchema,
    kickoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
    home: z.string().min(1).max(80),
    away: z.string().min(1).max(80),
    homeCode: z.string().length(3).optional(),
    awayCode: z.string().length(3).optional(),
    city: z.string().min(1).max(80),
    venue: z.string().min(1).max(120),
    importance: z.number().int().min(0).max(100).default(60),
  })
  .refine((v) => v.countryCode !== "CAF" || (v.homeCode && v.awayCode), {
    message: "Continental fixtures need homeCode and awayCode (the nations taking part)",
    path: ["homeCode"],
  })
  .refine((v) => v.home !== v.away, { message: "A team cannot play itself", path: ["away"] });

fixtures.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, createSchema);
  const db = c.env.DB;
  const countryCode = b.countryCode.toUpperCase();
  await assertManage(db, user, { countryCode });

  const comp = await db.prepare("SELECT var_enabled FROM competitions WHERE id = ?").bind(b.competitionId).first<{ var_enabled: number }>();
  if (!comp) throw new ApiError(422, "unknown_competition", "Unknown competition");

  // A match's crew follows its competition and its weight: VAR where the competition has it, an observer for big matches.
  const roles: CrewRole[] = ["R", "AR1", "AR2", "FOURTH"];
  if (comp.var_enabled === 1) roles.push("VAR", "AVAR");
  if (b.importance >= 70) roles.push("OBS");

  const id = b.id ?? `fx-${uuid().slice(0, 12)}`;
  const risk = b.importance >= 85 ? "high" : b.importance >= 65 ? "medium" : "low";
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO fixtures (id, country_code, competition_id, matchday, date, kickoff, home, away, home_code, away_code, city, venue, importance, risk)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, countryCode, b.competitionId, b.matchday, b.date, b.kickoff, b.home, b.away, b.homeCode?.toUpperCase() ?? null, b.awayCode?.toUpperCase() ?? null, b.city, b.venue, b.importance, risk),
      ...roles.map((role) => db.prepare("INSERT INTO designations (fixture_id, role) VALUES (?, ?)").bind(id, role)),
      auditStmt(db, user, { action: "fixture.create", entity: "fixture", entityId: id, after: { home: b.home, away: b.away, date: b.date }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "A fixture with this id already exists");
    throw err;
  }
  return c.json({ fixture: fixtureDto(await loadOne(db, id)) }, 201);
});

/* ------------------------------------------------------------------ *
 * Auto-fill — the engine proposes, the commission can undo the whole run
 * ------------------------------------------------------------------ */

const autofillSchema = z
  .object({
    fixtureIds: z.array(z.string()).max(150).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    country: z.string().max(3).optional(),
  })
  .refine((v) => v.fixtureIds?.length || v.from || v.country, { message: "Say which fixtures: fixtureIds, a date range, or a country" });

const SLOTS_PER_BATCH = 20;

fixtures.post("/autofill", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, autofillSchema);
  const db = c.env.DB;

  let list = await loadFixtures(db, b.fixtureIds ? { ids: b.fixtureIds } : { from: b.from, to: b.to ?? b.from, country: b.country?.toUpperCase() });
  list = list.filter((f) => !f.played);
  if (list.length > 150) throw new ApiError(422, "too_many_fixtures", "Auto-fill handles up to 150 fixtures at a time");
  if (list.length === 0) return c.json({ runId: null, filled: 0, skipped: 0, assignments: [] });

  const lookup = await zoneLookup(db);
  const manageable = list.filter((f) => user.role === "admin" || user.scope === "all" || inScope(user, f.countryCode, lookup));
  const skipped = list.length - manageable.length;

  const dates = manageable.map((f) => f.date).sort();
  const ctx = await DbEngineContext.load(db, dates[0] ?? today(), dates.at(-1) ?? today());
  manageable.forEach((f) => ctx.knowFixture(f));

  const runId = uuid();
  const groups: Array<{ stmts: D1PreparedStatement[]; fixtureId: string; role: CrewRole; officialId: string; reason: unknown }> = [];

  for (const fixture of manageable) {
    for (const slot of fixture.crew) {
      if (slot.role === "OBS") continue;
      if (slot.state !== "empty" && slot.state !== "declined") continue;
      const eligible = candidatesForSlot(ctx, fixture, slot.role, fixture.crew)
        // the person who just declined this slot is not offered it again
        .filter((cand) => cand.blockers.length === 0 && !(slot.state === "declined" && cand.id === slot.officialId));
      const pick = eligible[0] ?? null;
      if (!pick) continue;
      const reason = { rating: pick.rating, travel: pick.travelHours, rest: pick.rest, friction: pick.frictionRisk, score: pick.score };
      const stmts = slotChangeStmts(
        db,
        { fixture, role: slot.role, toOfficialId: pick.id, toState: "pending", action: "autofill", engineReason: reason, runId, actor: user, actorKind: "engine", ip: c.get("ip") },
        slot,
      );
      stmts.push(
        ...(await notifyOfficialStmts(db, pick.id, {
          title: { en: "New designation — please confirm", fr: "Nouvelle désignation — à confirmer" },
          detail: {
            en: `${ROLE_LABEL[slot.role].en}: ${matchLine(fixture)}`,
            fr: `${ROLE_LABEL[slot.role].fr} : ${matchLine(fixture)}`,
          },
          tone: "var",
          href: "/me",
          dedupeKey: `designation:${fixture.id}:${slot.role}:${pick.id}:${runId}`,
        })),
      );
      groups.push({ stmts, fixtureId: fixture.id, role: slot.role, officialId: pick.id, reason });
      // later slots, and later fixtures, must see this placement
      slot.officialId = pick.id;
      slot.state = "pending";
      ctx.place(pick.id, fixture.id, fixture.date);
    }
  }

  let stale = 0;
  for (let i = 0; i < groups.length; i += SLOTS_PER_BATCH) {
    const part = groups.slice(i, i + SLOTS_PER_BATCH);
    const results = await db.batch(part.flatMap((g) => g.stmts));
    let offset = 0;
    for (const g of part) {
      if (results[offset].meta.changes === 0) stale += 1;
      offset += g.stmts.length;
    }
  }

  return c.json({
    runId: groups.length ? runId : null,
    filled: groups.length - stale,
    skipped,
    stale,
    assignments: groups.map((g) => ({ fixtureId: g.fixtureId, role: g.role, officialId: g.officialId, reason: g.reason })),
  });
});

fixtures.post("/autofill/undo", staff, async (c) => {
  const user = currentUser(c);
  const { runId } = await readJson(c, z.object({ runId: z.string().min(8).max(64) }));
  const db = c.env.DB;
  const { results: rows } = await db
    .prepare(
      `SELECT fixture_id, role, from_official_id, to_official_id, from_state, to_state FROM designation_history
        WHERE run_id = ? AND action = 'autofill' ORDER BY id DESC`,
    )
    .bind(runId)
    .all<{ fixture_id: string; role: CrewRole; from_official_id: string | null; to_official_id: string; from_state: string; to_state: string }>();
  if (rows.length === 0) throw notFound("Auto-fill run");

  const list = await loadFixtures(db, { ids: [...new Set(rows.map((r) => r.fixture_id))] });
  const byId = new Map(list.map((f) => [f.id, f]));
  const lookup = await zoneLookup(db);

  let reverted = 0;
  let skipped = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const fixture = byId.get(r.fixture_id);
    const slot = fixture?.crew.find((s) => s.role === r.role);
    const allowed = fixture && (user.role === "admin" || user.scope === "all" || inScope(user, fixture.countryCode, lookup));
    // only undo what is still exactly as the engine left it — never overwrite a later human decision
    if (!fixture || !slot || !allowed || slot.officialId !== r.to_official_id || slot.state !== r.to_state) {
      skipped += 1;
      continue;
    }
    const toState = (r.from_official_id ? r.from_state : "empty") as "confirmed" | "pending" | "declined" | "empty";
    stmts.push(
      ...slotChangeStmts(db, { fixture, role: r.role, toOfficialId: r.from_official_id, toState, action: "revert", reason: `Undo of auto-fill ${runId}`, actor: user, ip: c.get("ip") }, slot),
    );
    reverted += 1;
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return c.json({ reverted, skipped });
});

/* ------------------------------------------------------------------ *
 * One fixture
 * ------------------------------------------------------------------ */

fixtures.get("/:id", async (c) => {
  const user = currentUser(c);
  if (user.role === "referee") throw forbidden("Use /me/designations for your own matches");
  return c.json({ fixture: fixtureDto(await loadOne(c.env.DB, c.req.param("id"))) });
});

const patchSchema = z
  .object({
    date: dateSchema,
    kickoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    venue: z.string().min(1).max(120),
    city: z.string().min(1).max(80),
    importance: z.number().int().min(0).max(100),
    matchday: z.number().int().min(1).max(100),
    reason: z.string().min(3).max(300).optional(),
  })
  .partial();

fixtures.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, patchSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, id);
  await assertManage(db, user, fixture);
  if (fixture.played) throw new ApiError(409, "match_played", "A played match can no longer be changed");

  const { reason, ...fields } = b;
  const cols: Record<string, string> = { date: "date", kickoff: "kickoff", venue: "venue", city: "city", importance: "importance", matchday: "matchday" };
  const sets = Object.entries(fields).filter(([k]) => k in cols).map(([k]) => `${cols[k]} = ?`);
  if (sets.length === 0) return c.json({ fixture: fixtureDto(fixture), warnings: [] });
  const args = Object.entries(fields).filter(([k]) => k in cols).map(([, v]) => v as string | number);

  const rescheduled = fields.date !== undefined || fields.kickoff !== undefined || fields.venue !== undefined;
  if (rescheduled && RESCHEDULABLE.includes(fixture.designationStatus) && !reason) {
    throw new ApiError(422, "reason_required", "Changing a validated or published match needs a written reason");
  }

  const updated: LoadedFixture = { ...fixture, ...(fields as Partial<LoadedFixture>) };
  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE fixtures SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(db, user, { action: "fixture.update", entity: "fixture", entityId: id, before: { date: fixture.date, kickoff: fixture.kickoff, venue: fixture.venue }, after: fields, reason, ip: c.get("ip") }),
  ];

  // Re-check everyone already on the crew against the new date, and tell them.
  const warnings: Array<{ role: CrewRole; officialId: string; blockers: string[] }> = [];
  if (rescheduled) {
    const ctx = await DbEngineContext.load(db, updated.date, updated.date);
    ctx.knowFixture(updated);
    for (const slot of updated.crew.filter((s) => s.officialId)) {
      const cand = candidatesForSlot(ctx, updated, slot.role, updated.crew).find((x) => x.id === slot.officialId);
      if (cand && cand.blockers.length) warnings.push({ role: slot.role, officialId: slot.officialId!, blockers: cand.blockers });
      stmts.push(
        ...(await notifyOfficialStmts(db, slot.officialId!, {
          title: { en: "Match rescheduled", fr: "Rencontre reprogrammée" },
          detail: { en: `Now: ${matchLine(updated)}`, fr: `Désormais : ${matchLine(updated)}` },
          tone: "amber",
          href: "/me",
        })),
      );
    }
  }
  await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, id)), warnings });
});

fixtures.get("/:id/candidates", staff, async (c) => {
  const q = parseQuery(c, z.object({ role: roleSchema, limit: z.coerce.number().int().min(1).max(300).default(60) }));
  const fixture = await loadOne(c.env.DB, c.req.param("id"));
  slotOf(fixture, q.role);
  const ctx = await DbEngineContext.load(c.env.DB, fixture.date, fixture.date);
  ctx.knowFixture(fixture);
  return c.json({ role: q.role, candidates: candidatesForSlot(ctx, fixture, q.role, fixture.crew).slice(0, q.limit) });
});

fixtures.get("/:id/history", async (c) => {
  const user = currentUser(c);
  if (!isStaff(user) && user.role !== "observer") throw forbidden();
  const id = c.req.param("id");
  const db = c.env.DB;
  const [history, audit] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT h.id, h.role, h.action, h.from_official_id AS fromOfficialId, fo.name AS fromName, h.to_official_id AS toOfficialId, t.name AS toName,
                h.from_state AS fromState, h.to_state AS toState, h.actor_kind AS actorKind, u.name AS actorName, h.reason, h.engine_reason AS engineReason, h.at
           FROM designation_history h
           LEFT JOIN officials fo ON fo.id = h.from_official_id LEFT JOIN officials t ON t.id = h.to_official_id LEFT JOIN users u ON u.id = h.actor_user_id
          WHERE h.fixture_id = ? ORDER BY h.id DESC LIMIT 200`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT a.id, a.at, a.action, u.name AS actorName, a.reason FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE a.entity = 'fixture' AND a.entity_id = ? AND a.action NOT LIKE 'designation.%' ORDER BY a.id DESC LIMIT 100`,
      )
      .bind(id),
  ]);
  return c.json({ history: history.results, events: audit.results });
});

/* ------------------------------------------------------------------ *
 * Designating
 * ------------------------------------------------------------------ */

const assignSchema = z.object({
  officialId: z.string().min(1),
  state: z.enum(["pending", "confirmed"]).default("pending"),
  override: z.boolean().default(false),
  reason: z.string().max(300).optional(),
  expectedVersion: z.number().int().optional(),
});

fixtures.put("/:id/designations/:role", staff, async (c) => {
  const user = currentUser(c);
  const role = roleSchema.parse(c.req.param("role"));
  const b = await readJson(c, assignSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  if (fixture.played) throw new ApiError(409, "match_played", "This match has been played");

  const slot = slotOf(fixture, role);
  if (b.expectedVersion !== undefined && b.expectedVersion !== slot.version) {
    throw new ApiError(409, "stale", "Someone else changed this slot — reload and try again", { currentVersion: slot.version });
  }
  if (slot.officialId === b.officialId && slot.state === b.state) {
    return c.json({ fixture: fixtureDto(fixture), changed: false });
  }

  const ctx = await DbEngineContext.load(db, fixture.date, fixture.date);
  ctx.knowFixture(fixture);
  assertEligible(ctx, fixture, role, b.officialId, { override: b.override, reason: b.reason });

  const replacing = slot.officialId !== null && slot.officialId !== b.officialId;
  const live = RESCHEDULABLE.includes(fixture.designationStatus);
  if ((replacing || live) && (!b.reason || b.reason.trim().length < 3)) {
    // the "motif" the brief asks for on every replacement
    throw new ApiError(422, "reason_required", "Replacing an official, or changing a validated match, needs a written reason");
  }

  const stmts = slotChangeStmts(
    db,
    { fixture, role, toOfficialId: b.officialId, toState: b.state, action: replacing ? "replace" : "assign", reason: b.reason, actor: user, ip: c.get("ip") },
    slot,
  );
  let results: D1Result[];
  try {
    results = await db.batch(stmts);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "That official already holds another role on this match");
    throw err;
  }
  if (results[0].meta.changes === 0) throw new ApiError(409, "stale", "Someone else changed this slot — reload and try again");

  const after: D1PreparedStatement[] = [];
  if (b.state === "pending") {
    after.push(
      ...(await notifyOfficialStmts(db, b.officialId, {
        title: { en: "New designation — please confirm", fr: "Nouvelle désignation — à confirmer" },
        detail: { en: `${ROLE_LABEL[role].en}: ${matchLine(fixture)}`, fr: `${ROLE_LABEL[role].fr} : ${matchLine(fixture)}` },
        tone: "var",
        href: "/me",
      })),
    );
  }
  if (replacing) {
    after.push(
      ...(await notifyOfficialStmts(db, slot.officialId!, {
        title: { en: "Designation withdrawn", fr: "Désignation retirée" },
        detail: { en: `${ROLE_LABEL[role].en}: ${matchLine(fixture)}. ${b.reason ?? ""}`, fr: `${ROLE_LABEL[role].fr} : ${matchLine(fixture)}. ${b.reason ?? ""}` },
        tone: "amber",
        href: "/me",
      })),
    );
  }
  if (after.length) await db.batch(after);
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), changed: true });
});

const clearSchema = z.object({ reason: z.string().max(300).optional(), expectedVersion: z.number().int().optional() }).default({});

fixtures.delete("/:id/designations/:role", staff, async (c) => {
  const user = currentUser(c);
  const role = roleSchema.parse(c.req.param("role"));
  const body = await c.req.json().catch(() => ({}));
  const b = clearSchema.parse(body);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  if (fixture.played) throw new ApiError(409, "match_played", "This match has been played");
  const slot = slotOf(fixture, role);
  if (!slot.officialId) return c.json({ fixture: fixtureDto(fixture), changed: false });
  if (b.expectedVersion !== undefined && b.expectedVersion !== slot.version) throw new ApiError(409, "stale", "Someone else changed this slot — reload and try again");
  if ((slot.state === "confirmed" || RESCHEDULABLE.includes(fixture.designationStatus)) && (!b.reason || b.reason.trim().length < 3)) {
    throw new ApiError(422, "reason_required", "Removing a confirmed official needs a written reason");
  }

  const results = await db.batch(
    slotChangeStmts(db, { fixture, role, toOfficialId: null, toState: "empty", action: "clear", reason: b.reason, actor: user, ip: c.get("ip") }, slot),
  );
  if (results[0].meta.changes === 0) throw new ApiError(409, "stale", "Someone else changed this slot — reload and try again");
  const notice = await notifyOfficialStmts(db, slot.officialId, {
    title: { en: "Designation withdrawn", fr: "Désignation retirée" },
    detail: { en: `${ROLE_LABEL[role].en}: ${matchLine(fixture)}. ${b.reason ?? ""}`, fr: `${ROLE_LABEL[role].fr} : ${matchLine(fixture)}. ${b.reason ?? ""}` },
    tone: "amber",
    href: "/me",
  });
  if (notice.length) await db.batch(notice);
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), changed: true });
});

const respondSchema = z.object({ response: z.enum(["accept", "decline"]), reason: z.string().max(300).optional() });

// An official answers their own designation; the commission can answer on their behalf.
fixtures.post("/:id/designations/:role/respond", async (c) => {
  const user = currentUser(c);
  const role = roleSchema.parse(c.req.param("role"));
  const b = await readJson(c, respondSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  const slot = slotOf(fixture, role);
  if (!slot.officialId) throw new ApiError(409, "empty_slot", "Nobody is designated to this slot");
  if (user.role === "observer" || (!isStaff(user) && user.officialId !== slot.officialId)) throw forbidden("Only the designated official can answer this designation");
  if (isStaff(user)) await assertManage(db, user, fixture);
  if (fixture.played) throw new ApiError(409, "match_played", "This match has been played");
  if (slot.state === "empty") throw new ApiError(409, "empty_slot", "Nothing to answer");
  if (b.response === "decline" && (!b.reason || b.reason.trim().length < 3)) {
    throw new ApiError(422, "reason_required", "Say why you are declining");
  }

  const toState = b.response === "accept" ? "confirmed" : "declined";
  if (slot.state === toState) return c.json({ fixture: fixtureDto(fixture), changed: false });

  const stmts = slotChangeStmts(
    db,
    { fixture, role, toOfficialId: slot.officialId, toState, action: b.response === "accept" ? "accept" : "decline", reason: b.reason, actor: user, ip: c.get("ip") },
    slot,
  );
  const results = await db.batch(stmts);
  if (results[0].meta.changes === 0) throw new ApiError(409, "stale", "This designation changed — reload and try again");

  if (b.response === "decline") {
    const who = await db.prepare("SELECT name FROM officials WHERE id = ?").bind(slot.officialId).first<{ name: string }>();
    await db.batch(
      notifyStmts(db, {
        audienceRole: "commission",
        dedupeKey: `declined:${fixture.id}:${role}:${slot.version}`,
        title: { en: "Designation declined", fr: "Désignation refusée" },
        detail: {
          en: `${who?.name ?? slot.officialId} declined ${ROLE_LABEL[role].en} for ${matchLine(fixture)}: ${b.reason}`,
          fr: `${who?.name ?? slot.officialId} a refusé ${ROLE_LABEL[role].fr} pour ${matchLine(fixture)} : ${b.reason}`,
        },
        tone: "red",
        href: "/calendar",
      }),
    );
  }
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), changed: true });
});

fixtures.post("/:id/designations/confirm-all", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  if (fixture.played) throw new ApiError(409, "match_played", "This match has been played");
  const pending = fixture.crew.filter((s) => s.officialId && s.state === "pending");
  const stmts = pending.flatMap((slot) =>
    slotChangeStmts(db, { fixture, role: slot.role, toOfficialId: slot.officialId, toState: "confirmed", action: "confirm", actor: user, ip: c.get("ip") }, slot),
  );
  if (stmts.length) await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), confirmed: pending.length });
});

/* ------------------------------------------------------------------ *
 * The pipeline: draft → awaiting confirmation → validated → published
 * ------------------------------------------------------------------ */

fixtures.post("/:id/submit", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  const empty = requiredSlots(fixture).filter((s) => !s.officialId || s.state === "declined");
  if (empty.length) {
    throw new ApiError(409, "crew_incomplete", "Every required role needs an official before the crew goes out for confirmation", { open: empty.map((s) => s.role) });
  }
  if (fixture.designationStatus !== "draft") return c.json({ fixture: fixtureDto(fixture), changed: false });
  await db.batch([
    db.prepare("UPDATE fixtures SET designation_status = 'awaiting_confirmation' WHERE id = ? AND designation_status = 'draft'").bind(fixture.id),
    auditStmt(db, user, { action: "fixture.submit", entity: "fixture", entityId: fixture.id, ip: c.get("ip") }),
  ]);
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), changed: true });
});

fixtures.post("/:id/validate", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  const unconfirmed = requiredSlots(fixture).filter((s) => s.state !== "confirmed");
  if (unconfirmed.length) {
    throw new ApiError(409, "not_confirmed", "Every required official must have confirmed before the commission validates", { open: unconfirmed.map((s) => ({ role: s.role, state: s.state })) });
  }
  if (fixture.designationStatus === "validated" || fixture.designationStatus === "published") return c.json({ fixture: fixtureDto(fixture), changed: false });
  await db.batch([
    db.prepare("UPDATE fixtures SET designation_status = 'validated', validated_by = ?, validated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(user.id, fixture.id),
    auditStmt(db, user, { action: "fixture.validate", entity: "fixture", entityId: fixture.id, ip: c.get("ip") }),
  ]);
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), changed: true });
});

fixtures.post("/:id/publish", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  if (fixture.designationStatus === "published") return c.json({ fixture: fixtureDto(fixture), changed: false });
  if (fixture.designationStatus !== "validated") {
    throw new ApiError(409, "not_validated", "The commission must validate the crew before it is published");
  }
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE fixtures SET designation_status = 'published', published_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(fixture.id),
    auditStmt(db, user, { action: "fixture.publish", entity: "fixture", entityId: fixture.id, ip: c.get("ip") }),
  ];
  // The convocation: every designated official is told, officially.
  for (const slot of fixture.crew.filter((s) => s.officialId)) {
    stmts.push(
      ...(await notifyOfficialStmts(db, slot.officialId!, {
        title: { en: "Convocation published", fr: "Convocation publiée" },
        detail: { en: `${ROLE_LABEL[slot.role].en}: ${matchLine(fixture)}`, fr: `${ROLE_LABEL[slot.role].fr} : ${matchLine(fixture)}` },
        tone: "pitch",
        href: "/me",
        dedupeKey: `convocation:${fixture.id}:${slot.role}:${slot.officialId}:${fixture.date}`,
      })),
    );
  }
  await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, fixture.id)), changed: true });
});

fixtures.get("/:id/convocations", staff, async (c) => {
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  if (fixture.designationStatus !== "published") throw new ApiError(409, "not_published", "Convocations exist once the crew is published");
  const ids = fixture.crew.filter((s) => s.officialId).map((s) => s.officialId!);
  const { results } = await db
    .prepare(`SELECT id, name, email, phone FROM officials WHERE id IN (${ids.map(() => "?").join(",") || "''"})`)
    .bind(...ids)
    .all<{ id: string; name: string; email: string | null; phone: string | null }>();
  const people = new Map(results.map((r) => [r.id, r]));
  return c.json({
    fixture: { id: fixture.id, home: fixture.home, away: fixture.away, date: fixture.date, kickoff: fixture.kickoff, venue: fixture.venue, city: fixture.city },
    convocations: fixture.crew
      .filter((s) => s.officialId)
      .map((s) => ({ role: s.role, roleLabel: ROLE_LABEL[s.role], official: people.get(s.officialId!), state: s.state })),
  });
});

/* ------------------------------------------------------------------ *
 * Result — closes the match so it can be assessed and paid
 * ------------------------------------------------------------------ */

const resultSchema = z.object({
  score: z.string().regex(/^\d{1,2}\s?[-–:]\s?\d{1,2}$/, "Use a score like 2-1"),
  pressureAvg: z.number().min(0).max(100).default(0),
});

fixtures.post("/:id/result", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, resultSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, c.req.param("id"));
  await assertManage(db, user, fixture);
  if (fixture.played) throw new ApiError(409, "match_played", "A result is already recorded");
  if (fixture.date > today()) throw new ApiError(409, "not_yet_played", "This match has not been played yet");
  const referee = fixture.crew.find((s) => s.role === "R");
  if (!referee?.officialId || referee.state === "declined") throw new ApiError(409, "no_referee", "A match needs a referee on record before its result");

  const matchId = `m-${fixture.id}`;
  await db.batch([
    db.prepare("UPDATE fixtures SET played = 1 WHERE id = ?").bind(fixture.id),
    db
      .prepare(
        `INSERT INTO matches (id, fixture_id, home, away, competition_id, country_code, date, score, referee_id, arps_for_match, rmcs, pressure_avg, physical, pressure_timeline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, '{}', '[]')`,
      )
      .bind(matchId, fixture.id, fixture.home, fixture.away, fixture.competitionId, fixture.countryCode, fixture.date, b.score.replace(/\s/g, ""), referee.officialId, b.pressureAvg),
    db.prepare("UPDATE officials SET matches = matches + 1 WHERE id = ?").bind(referee.officialId),
    auditStmt(db, user, { action: "fixture.result", entity: "fixture", entityId: fixture.id, after: { score: b.score, matchId }, ip: c.get("ip") }),
  ]);
  return c.json({ matchId, fixture: fixtureDto(await loadOne(db, fixture.id)) }, 201);
});

