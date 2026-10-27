import { Hono } from "hono";
import { z } from "zod";
import { candidatesForSlot } from "@core/engine";
import type { CrewRole } from "@core/types";
import type { AppEnv, AuthUser } from "../env";
import { ApiError, forbidden, notFound, nowIso, parse, parseQuery, readJson, today, uuid, type Ctx } from "../lib/http";

import { auditStmt } from "../lib/audit";
import { CONTINENTAL, assertCountry, scopeCountry } from "../lib/access";
import { notifyOfficialStmts, type Bilingual } from "../lib/notify";
import { localParts, toUtcIso } from "../lib/time";
import { currentUser, staff } from "../middleware/auth";
import { DbEngineContext, loadFixturePage, loadFixtures, type FixtureCursor, type LoadedFixture } from "../domain/engine-ctx";
import { assertEligible, requiredSlots, slotChangeStmts, slotOf, slotsFor, staffNoticeStmts } from "../domain/designations";

export const fixtures = new Hono<AppEnv>();

const ROLES = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"] as const;
const roleSchema = z.enum(ROLES);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const ROLE_LABEL: Record<CrewRole, Bilingual> = {
  R: { en: "Referee", fr: "Arbitre central" },
  AR1: { en: "Assistant referee 1", fr: "Arbitre assistant 1" },
  AR2: { en: "Assistant referee 2", fr: "Arbitre assistant 2" },
  FOURTH: { en: "Fourth official", fr: "Quatrième arbitre" },
  VAR: { en: "VAR", fr: "VAR" },
  AVAR: { en: "Assistant VAR", fr: "Assistant VAR" },
  OBS: { en: "Observer", fr: "Observateur" },
};

const matchLine = (f: Pick<LoadedFixture, "home" | "away" | "date" | "kickoff" | "venue" | "city">) =>
  `${f.home} – ${f.away}, ${f.date} ${f.kickoff}${f.venue ? `, ${f.venue}${f.city ? ` (${f.city})` : ""}` : ""}`;

/** The fixture as the app and the snapshot read it. `date` / `kickoff` are local at the venue; `kickoffAt` is UTC. */
export function fixtureDto(f: LoadedFixture) {
  return {
    id: f.id,
    countryCode: f.countryCode,
    competitionId: f.competitionId,
    matchday: f.matchday,
    roundLabel: f.roundLabel,
    date: f.date,
    kickoff: f.kickoff,
    kickoffAt: f.kickoffAt,
    timezone: f.timezone,
    home: f.home,
    away: f.away,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    homeCode: f.homeCode,
    awayCode: f.awayCode,
    stadiumId: f.stadiumId,
    city: f.city,
    venue: f.venue,
    importance: f.importance,
    risk: f.risk,
    status: f.status,
    played: f.played,
    designationStatus: f.designationStatus,
    crew: f.crew,
  };
}

/** One fixture the caller may see: foreign-country / continental / not-mine fixtures are 404, not 403. */
async function loadOne(db: D1Database, user: AuthUser, id: string) {
  const [fixture] = await loadFixtures(db, { ids: [id], scope: user });
  if (!fixture) throw notFound("Fixture");
  return fixture;
}

/** Designating, answering and recording results only make sense on a match that is still to be played. */
function assertOpen(fixture: LoadedFixture) {
  if (fixture.played) throw new ApiError(409, "match_played", "This match has been played");
  if (fixture.status !== "scheduled") throw new ApiError(409, "fixture_not_scheduled", `This match is ${fixture.status}`);
}

/** The IANA zone a fixture is played in: its stadium's country, else the country running it, else the home side's. */
async function venueZone(db: D1Database, p: { stadiumId: string | null; countryCode: string; homeTeamId: string }) {
  const row = await db
    .prepare(
      `SELECT COALESCE(
                (SELECT c.timezone FROM stadiums s JOIN countries c ON c.code = s.country WHERE s.id = ?1),
                (SELECT timezone FROM countries WHERE code = ?2),
                (SELECT c.timezone FROM teams t JOIN countries c ON c.code = t.country WHERE t.id = ?3),
                'UTC') AS tz`,
    )
    .bind(p.stadiumId, p.countryCode, p.homeTeamId)
    .first<{ tz: string }>();
  return row?.tz ?? "UTC";
}

const LIVE = ["validated", "published"];
const riskFor = (importance: number) => (importance >= 85 ? "high" : importance >= 65 ? "medium" : "low");

/** The list cursor is opaque to clients: base64url of [kickoffAt, importance, id]. */
const encodeCursor = (k: FixtureCursor) => btoa(JSON.stringify([k.kickoffAt, k.importance, k.id])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function decodeCursor(raw: string): FixtureCursor {
  try {
    const [kickoffAt, importance, id] = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof kickoffAt === "string" && typeof importance === "number" && typeof id === "string") return { kickoffAt, importance, id };
  } catch {
    /* fall through */
  }
  throw new ApiError(422, "invalid_cursor", "This cursor is not one the list returned");
}

/**
 * What stopping a fixture does besides its own status: a linked `matches` row follows it, and a cancellation frees
 * the crew (each slot cleared, with its history and audit) and cancels every unpaid line — nothing is owed for a match
 * nobody works. A postponed match keeps its crew; its date is set again later with PATCH.
 */
function stopStmts(db: D1Database, fixture: LoadedFixture, status: "postponed" | "cancelled", reason: string | undefined, user: AuthUser, ip?: string) {
  const stmts: D1PreparedStatement[] = [
    db
      .prepare("UPDATE matches SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE fixture_id = ? AND status IN ('scheduled', 'live')")
      .bind(status, fixture.id),
  ];
  if (status === "cancelled") {
    for (const slot of fixture.crew.filter((s) => s.officialId)) {
      stmts.push(...slotChangeStmts(db, { fixture, role: slot.role, toOfficialId: null, toState: "empty", action: "clear", reason: reason ?? "Match cancelled", actor: user, ip }, slot));
    }
    stmts.push(
      db.prepare("UPDATE advances SET status = 'paid', payment_id = NULL WHERE payment_id IN (SELECT id FROM payments WHERE fixture_id = ? AND status IN ('due', 'validated', 'contested'))").bind(fixture.id),
      db
        .prepare(
          `INSERT INTO audit_log (actor_user_id, actor_role, action, entity, entity_id, country_code, before, after, reason, ip)
           SELECT ?, ?, 'payment.cancel', 'payment', id, ?, json_object('status', status), json_object('status', 'cancelled'), 'Match cancelled', ?
             FROM payments WHERE fixture_id = ? AND status IN ('due', 'validated', 'contested')`,
        )
        .bind(user.id, user.role, fixture.countryCode, ip ?? null, fixture.id),
      db.prepare("UPDATE payments SET status = 'cancelled' WHERE fixture_id = ? AND status IN ('due', 'validated', 'contested')").bind(fixture.id),
    );
  }
  return stmts;
}

/* ------------------------------------------------------------------ *
 * Listing & creating
 * ------------------------------------------------------------------ */

const listQuery = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  country: z.string().max(3).optional(),
  competition: z.string().max(60).optional(),
  // a designation status (draft … published) or a fixture status (scheduled … cancelled)
  status: z.enum(["draft", "awaiting_confirmation", "validated", "published", "scheduled", "played", "postponed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300),
  /** `nextCursor` of the previous page. */
  cursor: z.string().min(1).max(400).optional(),
});

// Staff see their scope; a referee sees only the fixtures they are designated to.
// Paged in SQL (limit + cursor); `total` is every fixture the filter matches, `nextCursor` is null on the last page.
fixtures.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, listQuery);
  const country = q.country?.toUpperCase();
  if (user.role === "federation" && country && country !== user.country) return c.json({ fixtures: [], total: 0, nextCursor: null });
  const isDesignation = q.status && ["draft", "awaiting_confirmation", "validated", "published"].includes(q.status);
  const page = await loadFixturePage(
    c.env.DB,
    {
      from: q.from,
      to: q.to,
      country: scopeCountry(user, country) ?? undefined,
      competition: q.competition,
      designationStatus: isDesignation ? q.status : undefined,
      status: q.status && !isDesignation ? (q.status as LoadedFixture["status"]) : undefined,
      scope: user,
    },
    q.limit,
    q.cursor ? decodeCursor(q.cursor) : null,
  );
  return c.json({ fixtures: page.fixtures.map(fixtureDto), total: page.total, nextCursor: page.next ? encodeCursor(page.next) : null });
});

const createSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/).optional(),
    competitionId: z.string().min(1).max(60),
    round: z.number().int().min(1).max(100).optional(),
    matchday: z.number().int().min(1).max(100).optional(),
    roundLabel: z.string().min(1).max(60).optional(),
    homeTeamId: z.string().min(1).max(80),
    awayTeamId: z.string().min(1).max(80),
    stadiumId: z.string().min(1).max(80).nullish(),
    /** Local date and time at the venue. */
    date: dateSchema,
    time: timeSchema.optional(),
    kickoff: timeSchema.optional(),
    importance: z.number().int().min(0).max(100).default(60),
    risk: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine((v) => v.round !== undefined || v.matchday !== undefined, { message: "Give the round (round or matchday)", path: ["round"] })
  .refine((v) => v.time !== undefined || v.kickoff !== undefined, { message: "Give the local kickoff time (time, HH:MM)", path: ["time"] })
  .refine((v) => v.homeTeamId !== v.awayTeamId, { message: "A team cannot play itself", path: ["awayTeamId"] });

fixtures.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, createSchema);
  const db = c.env.DB;

  const comp = await db
    .prepare("SELECT id, country_code, tier, var_enabled, is_active FROM competitions WHERE id = ?")
    .bind(b.competitionId)
    .first<{ id: string; country_code: string; tier: string; var_enabled: number; is_active: number }>();
  if (!comp) {
    if (user.role !== "admin") throw notFound("Competition");
    throw new ApiError(422, "unknown_competition", "Unknown competition");
  }
  assertCountry(user, comp.country_code, "Competition");
  if (comp.is_active !== 1) throw new ApiError(409, "competition_inactive", "This competition is not active");

  const continental = comp.country_code === CONTINENTAL;
  const { results: teams } = await db
    .prepare("SELECT id, country FROM teams WHERE id IN (?, ?)")
    .bind(b.homeTeamId, b.awayTeamId)
    .all<{ id: string; country: string }>();
  if (teams.length !== 2) throw new ApiError(422, "unknown_team", "Both teams must exist");
  if (!continental && teams.some((t) => t.country !== comp.country_code)) {
    throw new ApiError(422, "team_outside_country", "A domestic fixture is played between teams of the competition's country");
  }
  let stadium: { id: string; country: string } | null = null;
  if (b.stadiumId) {
    stadium = await db.prepare("SELECT id, country FROM stadiums WHERE id = ?").bind(b.stadiumId).first<{ id: string; country: string }>();
    if (!stadium) throw new ApiError(422, "unknown_stadium", "Unknown stadium");
    if (!continental && stadium.country !== comp.country_code) {
      throw new ApiError(422, "stadium_outside_country", "A domestic fixture is played in a stadium of the competition's country");
    }
  }

  const time = (b.time ?? b.kickoff)!;
  const tz = await venueZone(db, { stadiumId: b.stadiumId ?? null, countryCode: comp.country_code, homeTeamId: b.homeTeamId });
  const kickoffAt = toUtcIso(b.date, time, tz);
  const back = localParts(kickoffAt, tz);
  if (back.date !== b.date || back.time !== time) {
    throw new ApiError(422, "invalid_local_time", `${b.date} ${time} does not exist in ${tz} (clock change)`);
  }

  const roles = slotsFor({ varEnabled: comp.var_enabled === 1, tier: comp.tier, importance: b.importance });
  const id = b.id ?? `fx-${uuid().slice(0, 12)}`;
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO fixtures (id, country_code, competition_id, round_no, round_label, home_team_id, away_team_id, stadium_id, kickoff_at, importance, risk)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, comp.country_code, comp.id, (b.round ?? b.matchday)!, b.roundLabel ?? null, b.homeTeamId, b.awayTeamId, b.stadiumId ?? null, kickoffAt, b.importance, b.risk ?? riskFor(b.importance)),
      ...roles.map((role) => db.prepare("INSERT INTO designations (fixture_id, role) VALUES (?, ?)").bind(id, role)),
      auditStmt(db, user, {
        action: "fixture.create",
        entity: "fixture",
        entityId: id,
        after: { competitionId: comp.id, homeTeamId: b.homeTeamId, awayTeamId: b.awayTeamId, kickoffAt, stadiumId: b.stadiumId ?? null },
        countryCode: comp.country_code,
        ip: c.get("ip"),
      }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "This fixture already exists (same id, or same teams in the same round of the competition)");
    throw err;
  }
  return c.json({ fixture: fixtureDto(await loadOne(db, user, id)) }, 201);
});

/* ------------------------------------------------------------------ *
 * Auto-fill — the engine proposes, the federation can undo the whole run
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

  const country = scopeCountry(user, b.country?.toUpperCase());
  if (user.role === "federation" && b.country && b.country.toUpperCase() !== user.country) {
    return c.json({ runId: null, filled: 0, skipped: 0, assignments: [] });
  }
  const found = await loadFixtures(db, b.fixtureIds ? { ids: b.fixtureIds, scope: user } : { from: b.from, to: b.to ?? b.from, country: country ?? undefined, scope: user });
  // ids the caller cannot see are not distinguishable from ids that do not exist
  if (b.fixtureIds?.length && found.length === 0) throw notFound("Fixture");
  const list = found.filter((f) => f.status === "scheduled");
  const skipped = (b.fixtureIds ? new Set(b.fixtureIds).size - list.length : found.length - list.length);
  if (list.length > 150) throw new ApiError(422, "too_many_fixtures", "Auto-fill handles up to 150 fixtures at a time");
  if (list.length === 0) return c.json({ runId: null, filled: 0, skipped, assignments: [] });

  const dates = list.map((f) => f.date).sort();
  const ctx = await DbEngineContext.load(db, dates[0] ?? today(), dates.at(-1) ?? today());
  list.forEach((f) => ctx.knowFixture(f));

  const runId = uuid();
  const groups: Array<{ stmts: D1PreparedStatement[]; fixtureId: string; role: CrewRole; officialId: string; reason: unknown }> = [];

  for (const fixture of list) {
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

  // only fixtures the caller may see are loaded; a run that touched none of them does not exist for this caller
  const list = await loadFixtures(db, { ids: [...new Set(rows.map((r) => r.fixture_id))], scope: user });
  if (list.length === 0) throw notFound("Auto-fill run");
  const byId = new Map(list.map((f) => [f.id, f]));

  let reverted = 0;
  let skipped = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    const fixture = byId.get(r.fixture_id);
    const slot = fixture?.crew.find((s) => s.role === r.role);
    // only undo what is still exactly as the engine left it — never overwrite a later human decision
    if (!fixture || !slot || fixture.status !== "scheduled" || slot.officialId !== r.to_official_id || slot.state !== r.to_state) {
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
  return c.json({ fixture: fixtureDto(await loadOne(c.env.DB, user, c.req.param("id"))) });
});

const patchSchema = z
  .object({
    date: dateSchema,
    time: timeSchema,
    kickoff: timeSchema,
    stadiumId: z.string().min(1).max(80),
    importance: z.number().int().min(0).max(100),
    risk: z.enum(["low", "medium", "high"]),
    round: z.number().int().min(1).max(100),
    matchday: z.number().int().min(1).max(100),
    roundLabel: z.string().min(1).max(60).nullable(),
    status: z.enum(["scheduled", "postponed", "cancelled"]),
    reason: z.string().min(3).max(300),
  })
  .partial();

fixtures.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, patchSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, id);
  if (fixture.played) throw new ApiError(409, "match_played", "A played match can no longer be changed");

  let stadium: { id: string; name: string; city: string; country: string } | null = null;
  const stadiumChanged = b.stadiumId !== undefined && b.stadiumId !== fixture.stadiumId;
  if (stadiumChanged) {
    stadium = await db.prepare("SELECT id, name, city, country FROM stadiums WHERE id = ?").bind(b.stadiumId!).first();
    if (!stadium) throw new ApiError(422, "unknown_stadium", "Unknown stadium");
    if (fixture.countryCode !== CONTINENTAL && stadium.country !== fixture.countryCode) {
      throw new ApiError(422, "stadium_outside_country", "A domestic fixture is played in a stadium of its country");
    }
  }
  const newStadiumId = stadiumChanged ? b.stadiumId! : fixture.stadiumId;
  const tz = stadiumChanged ? await venueZone(db, { stadiumId: newStadiumId, countryCode: fixture.countryCode, homeTeamId: fixture.homeTeamId }) : fixture.timezone;

  // a new local date / time is read in the (possibly new) venue's zone; a stadium change alone keeps the instant
  const newTime = b.time ?? b.kickoff;
  let kickoffAt = fixture.kickoffAt;
  if (b.date !== undefined || newTime !== undefined) {
    const date = b.date ?? fixture.date;
    const time = newTime ?? fixture.kickoff;
    kickoffAt = toUtcIso(date, time, tz);
    const back = localParts(kickoffAt, tz);
    if (back.date !== date || back.time !== time) throw new ApiError(422, "invalid_local_time", `${date} ${time} does not exist in ${tz} (clock change)`);
  }
  const rescheduled = kickoffAt !== fixture.kickoffAt || stadiumChanged;
  const newStatus = b.status ?? fixture.status;
  const statusChanged = newStatus !== fixture.status;
  const closing = statusChanged && newStatus !== "scheduled";

  const designated = fixture.crew.filter((s) => s.officialId);
  const someConfirmed = designated.some((s) => s.state === "confirmed");
  const needsReason = (closing && designated.length > 0) || (rescheduled && (LIVE.includes(fixture.designationStatus) || someConfirmed));
  if (needsReason && !b.reason) {
    throw new ApiError(422, "reason_required", "Changing, postponing or cancelling a match that has designated officials needs a written reason");
  }

  const newRound = b.round ?? b.matchday;
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (col: string, value: string | number | null) => (sets.push(`${col} = ?`), args.push(value));
  if (kickoffAt !== fixture.kickoffAt) set("kickoff_at", kickoffAt);
  if (stadiumChanged) set("stadium_id", newStadiumId);
  if (b.importance !== undefined && b.importance !== fixture.importance) set("importance", b.importance);
  if (b.risk !== undefined && b.risk !== fixture.risk) set("risk", b.risk);
  if (newRound !== undefined && newRound !== fixture.matchday) set("round_no", newRound);
  if (b.roundLabel !== undefined && b.roundLabel !== fixture.roundLabel) set("round_label", b.roundLabel);
  if (statusChanged) set("status", newStatus);
  if (sets.length === 0) return c.json({ fixture: fixtureDto(fixture), warnings: [] });

  const local = localParts(kickoffAt, tz);
  const updated: LoadedFixture = {
    ...fixture,
    kickoffAt,
    timezone: tz,
    date: local.date,
    kickoff: local.time,
    stadiumId: newStadiumId,
    venue: stadium ? stadium.name : fixture.venue,
    city: stadium ? stadium.city : fixture.city,
    importance: b.importance ?? fixture.importance,
    status: newStatus,
    matchday: newRound ?? fixture.matchday,
  };
  const stmts: D1PreparedStatement[] = [
    db.prepare(`UPDATE fixtures SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    // a postponement or cancellation made here has the same effects as POST /postpone and /cancel
    ...(closing ? stopStmts(db, fixture, newStatus as "postponed" | "cancelled", b.reason, user, c.get("ip")) : []),
    auditStmt(db, user, {
      action: closing ? `fixture.${newStatus}` : "fixture.update",

      entity: "fixture",
      entityId: id,
      before: { kickoffAt: fixture.kickoffAt, stadiumId: fixture.stadiumId, status: fixture.status, importance: fixture.importance },
      after: { kickoffAt, stadiumId: newStadiumId, status: newStatus, importance: updated.importance },
      reason: b.reason,
      countryCode: fixture.countryCode,
      ip: c.get("ip"),
    }),
  ];

  // Everyone designated is told — the crew is never changed behind their back — and re-checked against the new date.
  const warnings: Array<{ role: CrewRole; officialId: string; blockers: string[] }> = [];
  const why = b.reason ? { en: ` Reason: ${b.reason}`, fr: ` Motif : ${b.reason}` } : { en: "", fr: "" };
  if (rescheduled || statusChanged) {
    if (newStatus === "scheduled" && rescheduled) {
      const ctx = await DbEngineContext.load(db, updated.date, updated.date);
      ctx.knowFixture(updated);
      for (const slot of designated) {
        const cand = candidatesForSlot(ctx, updated, slot.role, updated.crew).find((x) => x.id === slot.officialId);
        if (cand && cand.blockers.length) warnings.push({ role: slot.role, officialId: slot.officialId!, blockers: cand.blockers });
      }
    }
    const notice =
      newStatus === "cancelled"
        ? { title: { en: "Match cancelled", fr: "Rencontre annulée" }, lead: { en: "Cancelled", fr: "Annulée" }, tone: "red" as const }
        : newStatus === "postponed"
          ? { title: { en: "Match postponed", fr: "Rencontre reportée" }, lead: { en: "Postponed", fr: "Reportée" }, tone: "amber" as const }
          : { title: { en: "Match rescheduled", fr: "Rencontre reprogrammée" }, lead: { en: "Now", fr: "Désormais" }, tone: "amber" as const };
    const detail = { en: `${notice.lead.en}: ${matchLine(updated)}.${why.en}`, fr: `${notice.lead.fr} : ${matchLine(updated)}.${why.fr}` };
    for (const officialId of new Set(designated.map((s) => s.officialId!))) {
      stmts.push(
        ...(await notifyOfficialStmts(db, officialId, {
          title: notice.title,
          detail,
          tone: notice.tone,
          href: "/me",
        })),
      );
    }
  }
  try {
    await db.batch(stmts);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "Another fixture already has these teams in this round");
    throw err;
  }
  return c.json({ fixture: fixtureDto(await loadOne(db, user, id)), warnings });
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });

/** Postpone (crew kept, told) or cancel (crew released, unpaid lines cancelled) a match still to be played. */
async function stopFixture(c: Ctx, status: "postponed" | "cancelled") {
  const user = currentUser(c);
  const { reason } = await readJson(c, reasonSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id")!);
  if (fixture.played) throw new ApiError(409, "match_played", "This match has been played");
  if (fixture.status === status) return c.json({ fixture: fixtureDto(fixture), changed: false });
  // a cancelled match stays cancelled; a postponed one may still be cancelled
  if (fixture.status === "cancelled" || (status === "postponed" && fixture.status !== "scheduled")) {
    throw new ApiError(409, "fixture_not_scheduled", `This match is ${fixture.status}`);
  }

  const crew = fixture.crew.filter((s) => s.officialId);
  const updated = { ...fixture, status };
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE fixtures SET status = ? WHERE id = ? AND status = ?").bind(status, fixture.id, fixture.status),
    ...stopStmts(db, fixture, status, reason, user, c.get("ip")),
    auditStmt(db, user, {
      action: `fixture.${status}`,
      entity: "fixture",
      entityId: fixture.id,
      before: { status: fixture.status, crew: crew.map((s) => ({ role: s.role, officialId: s.officialId, state: s.state })) },
      after: { status, crewReleased: status === "cancelled" },
      reason,
      countryCode: fixture.countryCode,
      ip: c.get("ip"),
    }),
  ];
  const notice =
    status === "cancelled"
      ? { title: { en: "Match cancelled", fr: "Rencontre annulée" }, lead: { en: "Cancelled", fr: "Annulée" }, tone: "red" as const, after: { en: " Your designation is released.", fr: " Votre désignation est levée." } }
      : { title: { en: "Match postponed", fr: "Rencontre reportée" }, lead: { en: "Postponed", fr: "Reportée" }, tone: "amber" as const, after: { en: " Your designation stands until the new date.", fr: " Votre désignation est maintenue jusqu'à la nouvelle date." } };
  for (const officialId of new Set(crew.map((s) => s.officialId!))) {
    stmts.push(
      ...(await notifyOfficialStmts(db, officialId, {
        title: notice.title,
        detail: {
          en: `${notice.lead.en}: ${matchLine(updated)}. Reason: ${reason}.${notice.after.en}`,
          fr: `${notice.lead.fr} : ${matchLine(updated)}. Motif : ${reason}.${notice.after.fr}`,
        },
        tone: notice.tone,
        href: "/me",
      })),
    );
  }
  await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true, released: status === "cancelled" ? crew.length : 0 });
}

fixtures.post("/:id/postpone", staff, (c) => stopFixture(c, "postponed"));
fixtures.post("/:id/cancel", staff, (c) => stopFixture(c, "cancelled"));

// Back to draft: the crew stays as it is, but the convocation no longer stands and the pipeline starts again.
fixtures.post("/:id/unpublish", staff, async (c) => {
  const user = currentUser(c);
  const { reason } = await readJson(c, reasonSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  assertOpen(fixture);
  if (fixture.designationStatus === "draft") return c.json({ fixture: fixtureDto(fixture), changed: false });
  const stmts: D1PreparedStatement[] = [
    db
      .prepare("UPDATE fixtures SET designation_status = 'draft', validated_by = NULL, validated_at = NULL, published_at = NULL WHERE id = ? AND designation_status = ?")
      .bind(fixture.id, fixture.designationStatus),
    auditStmt(db, user, {
      action: "fixture.unpublish",
      entity: "fixture",
      entityId: fixture.id,
      before: { designationStatus: fixture.designationStatus },
      after: { designationStatus: "draft" },
      reason,
      countryCode: fixture.countryCode,
      ip: c.get("ip"),
    }),
  ];
  for (const slot of fixture.crew.filter((s) => s.officialId)) {
    stmts.push(
      ...(await notifyOfficialStmts(db, slot.officialId!, {
        title: { en: "Convocation withdrawn", fr: "Convocation retirée" },
        detail: {
          en: `${ROLE_LABEL[slot.role].en}: ${matchLine(fixture)}. The crew is being reviewed. Reason: ${reason}`,
          fr: `${ROLE_LABEL[slot.role].fr} : ${matchLine(fixture)}. Le trio est en cours de révision. Motif : ${reason}`,
        },
        tone: "amber",
        href: "/me",
      })),
    );
  }
  await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

// Removing a fixture entered by mistake: only while it is a draft, or if it never went out as a convocation, and only
// if nothing hangs on it (a result, money, an advance). The crew's designation history stays as evidence.
fixtures.delete("/:id", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const b = parse(z.object({ reason: z.string().trim().min(3).max(300).optional() }).default({}), await c.req.json().catch(() => ({})));
  const fixture = await loadOne(db, user, c.req.param("id"));
  const use = (await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM matches WHERE fixture_id = ?1) AS matches,
              (SELECT COUNT(*) FROM payments WHERE fixture_id = ?1) AS payments,
              (SELECT COUNT(*) FROM advances WHERE fixture_id = ?1) AS advances,
              (SELECT COUNT(*) FROM audit_log WHERE entity = 'fixture' AND entity_id = ?1 AND action = 'fixture.publish') AS published`,
    )
    .bind(fixture.id)
    .first<{ matches: number; payments: number; advances: number; published: number }>())!;
  if (fixture.played || use.matches) throw new ApiError(409, "match_played", "A played match is the record; it cannot be deleted");
  if (fixture.designationStatus !== "draft" && use.published) {
    throw new ApiError(409, "published", "This crew was published; take it back to draft (with a reason) before deleting the fixture");
  }
  if (use.payments || use.advances) throw new ApiError(409, "in_use", "Payments or advances refer to this fixture", { payments: use.payments, advances: use.advances });

  const crew = fixture.crew.filter((s) => s.officialId);
  const stmts: D1PreparedStatement[] = [];
  for (const slot of crew) {
    stmts.push(
      ...(await notifyOfficialStmts(db, slot.officialId!, {
        title: { en: "Designation withdrawn", fr: "Désignation retirée" },
        detail: { en: `${ROLE_LABEL[slot.role].en}: ${matchLine(fixture)}. The fixture was removed.`, fr: `${ROLE_LABEL[slot.role].fr} : ${matchLine(fixture)}. La rencontre a été supprimée.` },
        tone: "amber",
        href: "/me",
      })),
    );
  }
  await db.batch([
    // the designations go with it (ON DELETE CASCADE); designation_history is append-only and stays
    db.prepare("DELETE FROM fixtures WHERE id = ?").bind(fixture.id),
    auditStmt(db, user, { action: "fixture.delete", entity: "fixture", entityId: fixture.id, before: fixtureDto(fixture), reason: b.reason, countryCode: fixture.countryCode, ip: c.get("ip") }),
    ...stmts,
  ]);
  return c.json({ ok: true });
});

fixtures.get("/:id/candidates", staff, async (c) => {

  const user = currentUser(c);
  const q = parseQuery(c, z.object({ role: roleSchema, limit: z.coerce.number().int().min(1).max(300).default(60) }));
  const fixture = await loadOne(c.env.DB, user, c.req.param("id"));
  slotOf(fixture, q.role);
  const ctx = await DbEngineContext.load(c.env.DB, fixture.date, fixture.date);
  ctx.knowFixture(fixture);
  // The engine may widen cover to other federations; a federation seat is only shown its own country's officials.
  const all = candidatesForSlot(ctx, fixture, q.role, fixture.crew);
  const visible = user.role === "admin" ? all : all.filter((cand) => cand.countryCode === user.country);
  return c.json({ role: q.role, candidates: visible.slice(0, q.limit) });
});

fixtures.get("/:id/history", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = (await loadOne(db, user, c.req.param("id"))).id;
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
  const role = parse(roleSchema, c.req.param("role"));
  const b = await readJson(c, assignSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  assertOpen(fixture);

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
  const live = LIVE.includes(fixture.designationStatus);
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
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

const clearSchema = z.object({ reason: z.string().max(300).optional(), expectedVersion: z.number().int().optional() }).default({});

fixtures.delete("/:id/designations/:role", staff, async (c) => {
  const user = currentUser(c);
  const role = parse(roleSchema, c.req.param("role"));
  const b = parse(clearSchema, await c.req.json().catch(() => ({})));
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  assertOpen(fixture);
  const slot = slotOf(fixture, role);
  if (!slot.officialId) return c.json({ fixture: fixtureDto(fixture), changed: false });
  if (b.expectedVersion !== undefined && b.expectedVersion !== slot.version) throw new ApiError(409, "stale", "Someone else changed this slot — reload and try again");
  if ((slot.state === "confirmed" || LIVE.includes(fixture.designationStatus)) && (!b.reason || b.reason.trim().length < 3)) {
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
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

const respondSchema = z.object({ response: z.enum(["accept", "decline"]), reason: z.string().max(300).optional() });

// An official answers their own designation; staff can answer on their behalf inside their scope.
// A referee reaches only fixtures they are designated to (anything else is 404).
fixtures.post("/:id/designations/:role/respond", async (c) => {
  const user = currentUser(c);
  const role = parse(roleSchema, c.req.param("role"));
  const b = await readJson(c, respondSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  const slot = slotOf(fixture, role);
  if (user.role === "referee" && user.officialId !== slot.officialId) throw forbidden("Only the designated official can answer this designation");
  if (!slot.officialId) throw new ApiError(409, "empty_slot", "Nobody is designated to this slot");
  assertOpen(fixture);
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
      staffNoticeStmts(db, fixture, {
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
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

fixtures.post("/:id/designations/confirm-all", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  assertOpen(fixture);
  const pending = fixture.crew.filter((s) => s.officialId && s.state === "pending");
  const stmts = pending.flatMap((slot) =>
    slotChangeStmts(db, { fixture, role: slot.role, toOfficialId: slot.officialId, toState: "confirmed", action: "confirm", actor: user, ip: c.get("ip") }, slot),
  );
  if (stmts.length) await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), confirmed: pending.length });
});

/* ------------------------------------------------------------------ *
 * The pipeline: draft → awaiting confirmation → validated → published
 * ------------------------------------------------------------------ */

fixtures.post("/:id/submit", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  const empty = requiredSlots(fixture).filter((s) => !s.officialId || s.state === "declined");
  if (empty.length) {
    throw new ApiError(409, "crew_incomplete", "Every required role needs an official before the crew goes out for confirmation", { open: empty.map((s) => s.role) });
  }
  if (fixture.designationStatus !== "draft") return c.json({ fixture: fixtureDto(fixture), changed: false });
  await db.batch([
    db.prepare("UPDATE fixtures SET designation_status = 'awaiting_confirmation' WHERE id = ? AND designation_status = 'draft'").bind(fixture.id),
    auditStmt(db, user, { action: "fixture.submit", entity: "fixture", entityId: fixture.id, countryCode: fixture.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

fixtures.post("/:id/validate", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  const unconfirmed = requiredSlots(fixture).filter((s) => s.state !== "confirmed");
  if (unconfirmed.length) {
    throw new ApiError(409, "not_confirmed", "Every required official must have confirmed before the federation validates", { open: unconfirmed.map((s) => ({ role: s.role, state: s.state })) });
  }
  if (fixture.designationStatus === "validated" || fixture.designationStatus === "published") return c.json({ fixture: fixtureDto(fixture), changed: false });
  await db.batch([
    db.prepare("UPDATE fixtures SET designation_status = 'validated', validated_by = ?, validated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(user.id, fixture.id),
    auditStmt(db, user, { action: "fixture.validate", entity: "fixture", entityId: fixture.id, countryCode: fixture.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

fixtures.post("/:id/publish", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  if (fixture.designationStatus === "published") return c.json({ fixture: fixtureDto(fixture), changed: false });
  if (fixture.designationStatus !== "validated") {
    throw new ApiError(409, "not_validated", "The federation must validate the crew before it is published");
  }
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE fixtures SET designation_status = 'published', published_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(fixture.id),
    auditStmt(db, user, { action: "fixture.publish", entity: "fixture", entityId: fixture.id, countryCode: fixture.countryCode, ip: c.get("ip") }),
  ];
  // The convocation: every designated official is told, officially.
  for (const slot of fixture.crew.filter((s) => s.officialId)) {
    stmts.push(
      ...(await notifyOfficialStmts(db, slot.officialId!, {
        title: { en: "Convocation published", fr: "Convocation publiée" },
        detail: { en: `${ROLE_LABEL[slot.role].en}: ${matchLine(fixture)}`, fr: `${ROLE_LABEL[slot.role].fr} : ${matchLine(fixture)}` },
        tone: "pitch",
        href: "/me",
        dedupeKey: `convocation:${fixture.id}:${slot.role}:${slot.officialId}:${fixture.kickoffAt}`,
      })),
    );
  }
  await db.batch(stmts);
  return c.json({ fixture: fixtureDto(await loadOne(db, user, fixture.id)), changed: true });
});

fixtures.get("/:id/convocations", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  if (fixture.designationStatus !== "published") throw new ApiError(409, "not_published", "Convocations exist once the crew is published");
  const ids = fixture.crew.filter((s) => s.officialId).map((s) => s.officialId!);
  const { results } = ids.length
    ? await db
        .prepare(`SELECT id, name, email, phone FROM officials WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .all<{ id: string; name: string; email: string | null; phone: string | null }>()
    : { results: [] as Array<{ id: string; name: string; email: string | null; phone: string | null }> };
  const people = new Map(results.map((r) => [r.id, r]));
  return c.json({
    fixture: { id: fixture.id, home: fixture.home, away: fixture.away, date: fixture.date, kickoff: fixture.kickoff, kickoffAt: fixture.kickoffAt, venue: fixture.venue, city: fixture.city },
    convocations: fixture.crew
      .filter((s) => s.officialId)
      .map((s) => ({ role: s.role, roleLabel: ROLE_LABEL[s.role], official: people.get(s.officialId!), state: s.state })),
  });
});

/* ------------------------------------------------------------------ *
 * Result — closes the match so it can be assessed and paid
 * ------------------------------------------------------------------ */

const resultSchema = z
  .object({
    /** "2-1" — or give homeScore and awayScore. */
    score: z.string().regex(/^\d{1,2}\s?[-–:]\s?\d{1,2}$/, "Use a score like 2-1").optional(),
    homeScore: z.number().int().min(0).max(99).optional(),
    awayScore: z.number().int().min(0).max(99).optional(),
    pressureAvg: z.number().min(0).max(100).default(0),
    attendance: z.number().int().min(0).max(300_000).optional(),
  })
  .refine((v) => v.score !== undefined || (v.homeScore !== undefined && v.awayScore !== undefined), { message: "Give the score (score, or homeScore and awayScore)", path: ["score"] });

fixtures.post("/:id/result", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, resultSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  assertOpen(fixture);
  if (fixture.kickoffAt > nowIso()) throw new ApiError(409, "not_yet_played", "This match has not been played yet");
  const referee = fixture.crew.find((s) => s.role === "R");
  if (!referee?.officialId || referee.state === "declined") throw new ApiError(409, "no_referee", "A match needs a referee on record before its result");

  let homeScore = b.homeScore;
  let awayScore = b.awayScore;
  if (b.score) [homeScore, awayScore] = b.score.split(/[-–:]/).map((n) => Number(n.trim()));
  const comp = await db.prepare("SELECT season FROM competitions WHERE id = ?").bind(fixture.competitionId).first<{ season: string }>();

  const matchId = `m-${fixture.id}`;
  try {
    await db.batch([
      db.prepare("UPDATE fixtures SET status = 'played' WHERE id = ? AND status = 'scheduled'").bind(fixture.id),
      db
        .prepare(
          `INSERT INTO matches (id, league_id, season, matchday, home_team_id, away_team_id, match_date, venue, referee, home_score, away_score, score_source, status, attendance, fixture_id, referee_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT name FROM officials WHERE id = ?), ?, ?, 'official', 'finished', ?, ?, ?)`,
        )
        .bind(matchId, fixture.competitionId, comp?.season ?? null, String(fixture.matchday), fixture.homeTeamId, fixture.awayTeamId, fixture.kickoffAt, fixture.venue || null, referee.officialId, homeScore!, awayScore!, b.attendance ?? null, fixture.id, referee.officialId),
      db.prepare("INSERT INTO match_officiating (match_id, arps_for_match, rmcs, pressure_avg) VALUES (?, 0, 0, ?)").bind(matchId, b.pressureAvg),
      db.prepare("UPDATE officials SET matches = matches + 1 WHERE id = ?").bind(referee.officialId),
      auditStmt(db, user, {
        action: "fixture.result",
        entity: "fixture",
        entityId: fixture.id,
        after: { homeScore, awayScore, matchId },
        countryCode: fixture.countryCode,
        ip: c.get("ip"),
      }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate_match", "A match between these teams is already recorded for that day");
    throw err;
  }
  return c.json({ matchId, fixture: fixtureDto(await loadOne(db, user, fixture.id)) }, 201);
});

const correctSchema = z
  .object({
    score: z.string().regex(/^\d{1,2}\s?[-–:]\s?\d{1,2}$/, "Use a score like 2-1").optional(),
    homeScore: z.number().int().min(0).max(99).optional(),
    awayScore: z.number().int().min(0).max(99).optional(),
    attendance: z.number().int().min(0).max(300_000).nullable().optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => v.score !== undefined || (v.homeScore !== undefined && v.awayScore !== undefined), { message: "Give the score (score, or homeScore and awayScore)", path: ["score"] });

// Correcting a result already recorded (a typing error, a decision of the competition body). The previous value stays
// in the audit row; the match keeps its id, its assessments and its payments.
fixtures.patch("/:id/result", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, correctSchema);
  const db = c.env.DB;
  const fixture = await loadOne(db, user, c.req.param("id"));
  if (!fixture.played) throw new ApiError(409, "not_played", "This match has no result to correct yet");
  const match = await db
    .prepare("SELECT id, home_score AS homeScore, away_score AS awayScore, attendance FROM matches WHERE fixture_id = ?")
    .bind(fixture.id)
    .first<{ id: string; homeScore: number | null; awayScore: number | null; attendance: number | null }>();
  if (!match) throw new ApiError(409, "not_played", "This match has no result to correct yet");

  let homeScore = b.homeScore;
  let awayScore = b.awayScore;
  if (b.score) [homeScore, awayScore] = b.score.split(/[-–:]/).map((n) => Number(n.trim()));
  const attendance = b.attendance === undefined ? match.attendance : b.attendance;
  if (homeScore === match.homeScore && awayScore === match.awayScore && attendance === match.attendance) {
    return c.json({ matchId: match.id, changed: false, result: { homeScore, awayScore, attendance } });
  }
  await db.batch([
    db
      .prepare("UPDATE matches SET home_score = ?, away_score = ?, attendance = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .bind(homeScore!, awayScore!, attendance, match.id),
    auditStmt(db, user, {
      action: "fixture.result_correct",
      entity: "fixture",
      entityId: fixture.id,
      before: { homeScore: match.homeScore, awayScore: match.awayScore, attendance: match.attendance, matchId: match.id },
      after: { homeScore, awayScore, attendance, matchId: match.id },
      reason: b.reason,
      countryCode: fixture.countryCode,
      ip: c.get("ip"),
    }),
  ]);
  return c.json({ matchId: match.id, changed: true, result: { homeScore, awayScore, attendance } });
});
