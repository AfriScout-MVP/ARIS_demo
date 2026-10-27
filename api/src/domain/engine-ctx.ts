// Feeds the shared designation engine (site/src/lib/core/engine.ts) from D1.
// The engine is synchronous, so everything it may ask for in a date window is
// loaded up front, and `place()` keeps it current while a batch is being filled.
//
// Fixtures are stored as one UTC instant plus team / stadium ids. The engine reasons in calendar days at the
// venue, so every fixture is loaded with its LOCAL date and time (lib/time + the venue country's timezone).

import type { EngineContext } from "@core/engine";
import type { AvailabilityState, CrewRole, CrewSlot, Fixture, PoolEntry, Zone } from "@core/types";
import { roleWantsReferee } from "@core/engine";
import type { AuthUser } from "../env";
import { CONTINENTAL } from "../lib/access";
import { chunk, marks } from "../lib/http";
import { localParts } from "../lib/time";

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);

interface OfficialRow {
  id: string;
  kind: "referee" | "assistant";
  name: string;
  initials: string;
  country_code: string;
  status: string;
  var_qualified: number;
  rmcs_avg: number;
  fitness: number;
  trend: number;
}

/**
 * `FROM fixtures f` plus the joins that give a fixture its team names, its venue and the timezone it is played in:
 * the stadium's country, else the country running the fixture, else the home side's country (continental ties).
 */
export const FIXTURE_FROM = `
  FROM fixtures f
  JOIN teams ht ON ht.id = f.home_team_id
  JOIN teams aw ON aw.id = f.away_team_id
  LEFT JOIN stadiums st ON st.id = f.stadium_id
  LEFT JOIN countries sc ON sc.code = st.country
  LEFT JOIN countries fc ON fc.code = f.country_code
  LEFT JOIN countries hc ON hc.code = ht.country`;
export const FIXTURE_TZ = "COALESCE(sc.timezone, fc.timezone, hc.timezone, 'UTC')";

const FIXTURE_COLUMNS = `
  f.id, f.country_code, f.competition_id, f.round_no, f.round_label, f.home_team_id, f.away_team_id, f.stadium_id, f.kickoff_at,
  f.importance, f.risk, f.status, f.designation_status,
  ht.name AS home, aw.name AS away, ht.country AS home_country, aw.country AS away_country,
  st.name AS venue, COALESCE(st.city, ht.city) AS city, ${FIXTURE_TZ} AS tz`;

interface FixtureRow {
  id: string;
  country_code: string;
  competition_id: string;
  round_no: number;
  round_label: string | null;
  home_team_id: string;
  away_team_id: string;
  stadium_id: string | null;
  kickoff_at: string;
  importance: number;
  risk: "low" | "medium" | "high";
  status: "scheduled" | "played" | "postponed" | "cancelled";
  designation_status: string;
  home: string;
  away: string;
  home_country: string;
  away_country: string;
  venue: string | null;
  city: string | null;
  tz: string;
}

/** A slot as the API returns it: the engine's view plus the row version for optimistic concurrency. */
export type ApiSlot = CrewSlot & { version: number };

export interface LoadedFixture extends Omit<Fixture, "crew"> {
  crew: ApiSlot[];
  /** Local date (`date`) and HH:MM (`kickoff`) at the venue; `kickoffAt` is the stored UTC instant. */
  kickoffAt: string;
  timezone: string;
  roundLabel: string | null;
  homeTeamId: string;
  awayTeamId: string;
  stadiumId: string | null;
  /** The nations of a continental tie (the sides' countries); null on domestic fixtures. */
  homeCode: string | null;
  awayCode: string | null;
  status: "scheduled" | "played" | "postponed" | "cancelled";
  designationStatus: string;
}

/** SQL (on alias `f`) confining fixtures to what a caller may see: all / own country / the ones they are designated to. */
export function fixtureScope(user: Pick<AuthUser, "role" | "country" | "officialId">): { sql: string; params: string[] } {
  if (user.role === "admin") return { sql: "1 = 1", params: [] };
  if (user.role === "federation" && user.country) return { sql: "f.country_code = ?", params: [user.country] };
  if (user.role === "referee" && user.officialId) {
    return { sql: "EXISTS (SELECT 1 FROM designations sd WHERE sd.fixture_id = f.id AND sd.official_id = ?)", params: [user.officialId] };
  }
  return { sql: "1 = 0", params: [] };
}

export interface FixtureFilter {
  ids?: string[];
  /** Local dates at the venue, inclusive. */
  from?: string;
  to?: string;
  country?: string;
  competition?: string;
  status?: LoadedFixture["status"];
  designationStatus?: string;
  /** Confine to what this caller may see (always pass it from a route). */
  scope?: Pick<AuthUser, "role" | "country" | "officialId">;
}

function toLoaded(r: FixtureRow, crew: ApiSlot[]): LoadedFixture {
  const local = localParts(r.kickoff_at, r.tz);
  const continental = r.country_code === CONTINENTAL;
  return {
    id: r.id,
    countryCode: r.country_code,
    competitionId: r.competition_id,
    matchday: r.round_no,
    roundLabel: r.round_label,
    date: local.date,
    kickoff: local.time,
    kickoffAt: r.kickoff_at,
    timezone: r.tz,
    home: r.home,
    away: r.away,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    stadiumId: r.stadium_id,
    homeCode: continental ? r.home_country : null,
    awayCode: continental ? r.away_country : null,
    city: r.city ?? "",
    venue: r.venue ?? "",
    importance: r.importance,
    risk: r.risk,
    status: r.status,
    played: r.status === "played",
    designationStatus: r.designation_status,
    crew,
  };
}

const ROLE_ORDER: CrewRole[] = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"];

/** The WHERE clauses of a fixture filter (on alias `f`). */
function filterClauses(where: FixtureFilter) {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (where.scope) {
    const s = fixtureScope(where.scope);
    clauses.push(s.sql);
    params.push(...s.params);
  }
  // `f.date` is the UTC day; the local day can differ by at most a day either way.
  if (where.from) (clauses.push("f.date >= ?"), params.push(addDays(where.from, -1)));
  if (where.to) (clauses.push("f.date <= ?"), params.push(addDays(where.to, 1)));
  if (where.country) (clauses.push("f.country_code = ?"), params.push(where.country));
  if (where.competition) (clauses.push("f.competition_id = ?"), params.push(where.competition));
  if (where.status) (clauses.push("f.status = ?"), params.push(where.status));
  if (where.designationStatus) (clauses.push("f.designation_status = ?"), params.push(where.designationStatus));
  return { clauses, params };
}

/** Fixtures with their crews, as the engine and the API both want them. Filters run in SQL. */
export async function loadFixtures(db: D1Database, where: FixtureFilter): Promise<LoadedFixture[]> {
  const { clauses, params } = filterClauses(where);
  const rows: FixtureRow[] = [];
  const query = async (extra: string[], extraParams: (string | number)[]) => {
    const all = [...clauses, ...extra];
    const { results } = await db
      .prepare(`SELECT ${FIXTURE_COLUMNS} ${FIXTURE_FROM} ${all.length ? "WHERE " + all.join(" AND ") : ""} ORDER BY f.kickoff_at, f.importance DESC, f.id`)
      .bind(...params, ...extraParams)
      .all<FixtureRow>();
    rows.push(...results);
  };
  if (where.ids) {
    for (const ids of chunk([...new Set(where.ids)], 80)) await query([`f.id IN (${marks(ids.length)})`], ids);
    rows.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at) || b.importance - a.importance || a.id.localeCompare(b.id));
  } else {
    await query([], []);
  }
  return withCrews(db, rows, where);
}

/** Where a page of fixtures stopped: the list order is (kickoff, importance desc, id). */
export interface FixtureCursor {
  kickoffAt: string;
  importance: number;
  id: string;
}

/**
 * One page of `loadFixtures`, read with a keyset cursor in SQL instead of loading the whole window. `total` counts
 * every fixture the filter matches (local dates included), so a caller can still say "120 of 480".
 */
export async function loadFixturePage(db: D1Database, where: Omit<FixtureFilter, "ids">, limit: number, after?: FixtureCursor | null) {
  const { clauses, params } = filterClauses(where);
  const page: LoadedFixture[] = [];
  let cursor = after ?? null;
  // The SQL window is a day wider than the local dates asked for (see filterClauses), so a batch can lose a few
  // rows to the local-date trim: keep reading until the page (plus one, to know there is more) is full.
  for (;;) {
    const want = limit + 1 - page.length;
    const extra = cursor ? ["(f.kickoff_at > ? OR (f.kickoff_at = ? AND (f.importance < ? OR (f.importance = ? AND f.id > ?))))"] : [];
    const extraParams = cursor ? [cursor.kickoffAt, cursor.kickoffAt, cursor.importance, cursor.importance, cursor.id] : [];
    const all = [...clauses, ...extra];
    const { results } = await db
      .prepare(`SELECT ${FIXTURE_COLUMNS} ${FIXTURE_FROM} ${all.length ? "WHERE " + all.join(" AND ") : ""} ORDER BY f.kickoff_at, f.importance DESC, f.id LIMIT ?`)
      .bind(...params, ...extraParams, want)
      .all<FixtureRow>();
    page.push(...(await withCrews(db, results, where)));
    if (results.length < want || page.length > limit) break;
    const last = results.at(-1)!;
    cursor = { kickoffAt: last.kickoff_at, importance: last.importance, id: last.id };
  }
  const more = page.length > limit;
  const fixtures = page.slice(0, limit);
  const end = fixtures.at(-1);

  // the count only needs each fixture's instant and zone (for the local-date trim), not its crew
  const { results: all } = await db
    .prepare(`SELECT f.kickoff_at, ${FIXTURE_TZ} AS tz ${FIXTURE_FROM} ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""}`)
    .bind(...params)
    .all<{ kickoff_at: string; tz: string }>();
  const total =
    where.from || where.to
      ? all.filter((r) => {
          const d = localParts(r.kickoff_at, r.tz).date;
          return (!where.from || d >= where.from) && (!where.to || d <= where.to);
        }).length
      : all.length;
  return { fixtures, total, next: more && end ? { kickoffAt: end.kickoffAt, importance: end.importance, id: end.id } : null };
}

async function withCrews(db: D1Database, rows: FixtureRow[], where: Pick<FixtureFilter, "from" | "to">): Promise<LoadedFixture[]> {
  if (rows.length === 0) return [];
  const crews = new Map<string, ApiSlot[]>();

  for (const ids of chunk(rows.map((r) => r.id))) {
    const { results } = await db
      .prepare(`SELECT fixture_id, role, official_id, state, version FROM designations WHERE fixture_id IN (${marks(ids.length)})`)
      .bind(...ids)
      .all<{ fixture_id: string; role: CrewRole; official_id: string | null; state: CrewSlot["state"]; version: number }>();
    for (const d of results) {
      const list = crews.get(d.fixture_id) ?? [];
      list.push({ role: d.role, officialId: d.official_id, state: d.state, version: d.version });
      crews.set(d.fixture_id, list);
    }
  }
  return rows
    .map((r) => toLoaded(r, (crews.get(r.id) ?? []).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))))
    .filter((f) => (!where.from || f.date >= where.from) && (!where.to || f.date <= where.to));
}

export class DbEngineContext implements EngineContext {
  private referees: PoolEntry[] = [];
  private assistants: PoolEntry[] = [];
  private statusOf = new Map<string, string>();
  private zones = new Map<string, Zone>();
  private nations = new Map<string, string[]>();
  /** every placed (non-empty) designation in the window: official → [{fixtureId, date}] (local dates) */
  private placed = new Map<string, Array<{ fixtureId: string; date: string }>>();
  private declared = new Map<string, AvailabilityState>();
  private conflicts = new Map<string, Array<{ kind: string; subject: string }>>();

  /** `from` / `to` are local dates at the venue. */
  static async load(db: D1Database, from: string, to: string): Promise<DbEngineContext> {
    const ctx = new DbEngineContext();
    const lookback = addDays(from, -14);

    const [officials, countries, placed, declared, conflicts, nations] = await db.batch<Record<string, unknown>>([
      db.prepare(
        "SELECT id, kind, name, initials, country_code, status, var_qualified, rmcs_avg, fitness, trend FROM officials WHERE status <> 'retired'",
      ),
      db.prepare("SELECT code, zone FROM countries"),
      // postponed and cancelled fixtures do not keep anyone busy
      db
        .prepare(
          `SELECT d.official_id, d.fixture_id, f.kickoff_at, ${FIXTURE_TZ} AS tz ${FIXTURE_FROM} JOIN designations d ON d.fixture_id = f.id
            WHERE d.official_id IS NOT NULL AND d.state <> 'empty' AND f.status IN ('scheduled', 'played') AND f.date BETWEEN ? AND ?`,
        )
        .bind(addDays(lookback, -1), addDays(to, 1)),
      db.prepare("SELECT official_id, date, state FROM availability WHERE date BETWEEN ? AND ?").bind(from, to),
      db.prepare("SELECT official_id, kind, subject FROM conflicts_of_interest"),
      db
        .prepare(
          `SELECT f.id, ht.country AS home_code, aw.country AS away_code ${FIXTURE_FROM} WHERE f.country_code = ? AND f.date BETWEEN ? AND ?`,
        )
        .bind(CONTINENTAL, addDays(from, -1), addDays(to, 1)),
    ]);

    for (const r of officials.results as unknown as OfficialRow[]) {
      const entry: PoolEntry = {
        id: r.id,
        name: r.name,
        initials: r.initials,
        countryCode: r.country_code,
        kind: r.kind,
        rating: r.rmcs_avg,
        fitness: r.kind === "referee" ? r.fitness : 80,
        suspended: r.status === "suspended",
        varQualified: r.var_qualified === 1,
        trend: r.kind === "referee" ? r.trend : 0,
      };
      ctx.statusOf.set(r.id, r.status);
      (r.kind === "referee" ? ctx.referees : ctx.assistants).push(entry);
    }
    for (const c of countries.results as Array<{ code: string; zone: Zone }>) ctx.zones.set(c.code, c.zone);
    for (const p of placed.results as Array<{ official_id: string; fixture_id: string; kickoff_at: string; tz: string }>) {
      const date = localParts(p.kickoff_at, p.tz).date;
      if (date >= lookback && date <= to) ctx.place(p.official_id, p.fixture_id, date);
    }
    for (const a of declared.results as Array<{ official_id: string; date: string; state: AvailabilityState }>) {
      ctx.declared.set(`${a.official_id}|${a.date}`, a.state);
    }
    for (const c of conflicts.results as Array<{ official_id: string; kind: string; subject: string }>) {
      const list = ctx.conflicts.get(c.official_id) ?? [];
      list.push({ kind: c.kind, subject: c.subject.toLowerCase() });
      ctx.conflicts.set(c.official_id, list);
    }
    for (const n of nations.results as Array<{ id: string; home_code: string; away_code: string }>) {
      ctx.nations.set(n.id, [n.home_code, n.away_code]);
    }
    return ctx;
  }

  /** Record a designation so later engine calls (autofill) see it. */
  place(officialId: string, fixtureId: string, date: string) {
    const list = this.placed.get(officialId) ?? [];
    if (!list.some((p) => p.fixtureId === fixtureId)) list.push({ fixtureId, date });
    this.placed.set(officialId, list);
  }
  unplace(officialId: string, fixtureId: string) {
    const list = this.placed.get(officialId);
    if (list)
      this.placed.set(
        officialId,
        list.filter((p) => p.fixtureId !== fixtureId),
      );
  }
  /** Teach the context a fixture's nations (needed when the fixture lies outside the loaded window). */
  knowFixture(f: LoadedFixture) {
    if (f.homeCode && f.awayCode) this.nations.set(f.id, [f.homeCode, f.awayCode]);
  }

  pool(role: CrewRole): PoolEntry[] {
    return roleWantsReferee(role) ? this.referees : this.assistants;
  }
  zoneOf(code: string) {
    return this.zones.get(code);
  }
  nationsOf(fixture: Fixture) {
    return this.nations.get(fixture.id) ?? [];
  }
  availability(officialId: string, date: string): AvailabilityState {
    if (this.statusOf.get(officialId) === "unavailable") return "unavailable";
    if (this.placed.get(officialId)?.some((p) => p.date === date)) return "assigned";
    return this.declared.get(`${officialId}|${date}`) ?? "available";
  }
  restDays(officialId: string, date: string) {
    const past = (this.placed.get(officialId) ?? []).filter((p) => p.date < date).map((p) => p.date);
    if (past.length === 0) return 14;
    return daysBetween(past.sort().at(-1)!, date);
  }
  busyElsewhere(officialId: string, fixture: Fixture) {
    return (this.placed.get(officialId) ?? []).some((p) => p.date === fixture.date && p.fixtureId !== fixture.id);
  }
  /** Declared links: a club / team by name, or a country by code (the nations of a continental tie, or the fixture's country). */
  hasConflict(officialId: string, fixture: LoadedFixture | Fixture) {
    const list = this.conflicts.get(officialId);
    if (!list) return false;
    const f = fixture as LoadedFixture;
    const teams = [fixture.home.toLowerCase(), fixture.away.toLowerCase()];
    const nations = [f.homeCode, f.awayCode, fixture.countryCode].filter(Boolean).map((c) => c!.toLowerCase());
    return list.some((c) => (c.kind === "country" ? nations.includes(c.subject) : teams.includes(c.subject)));
  }
}
