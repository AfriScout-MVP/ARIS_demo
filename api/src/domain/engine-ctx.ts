// Feeds the shared designation engine (site/src/lib/core/engine.ts) from D1.
// The engine is synchronous, so everything it may ask for in a date window is
// loaded up front, and `place()` keeps it current while a batch is being filled.

import type { EngineContext } from "@core/engine";
import type { AvailabilityState, CrewRole, CrewSlot, Fixture, PoolEntry, Zone } from "@core/types";
import { roleWantsReferee } from "@core/engine";
import { chunk, marks } from "../lib/http";

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

interface FixtureRow {
  id: string;
  country_code: string;
  competition_id: string;
  matchday: number;
  date: string;
  kickoff: string;
  home: string;
  away: string;
  home_code: string | null;
  away_code: string | null;
  city: string;
  venue: string;
  importance: number;
  risk: "low" | "medium" | "high";
  played: number;
  designation_status: string;
}

/** A slot as the API returns it: the engine's view plus the row version for optimistic concurrency. */
export type ApiSlot = CrewSlot & { version: number };

export interface LoadedFixture extends Omit<Fixture, "crew"> {
  crew: ApiSlot[];
  homeCode: string | null;
  awayCode: string | null;
  designationStatus: string;
}

/** Fixtures with their crews, as the engine and the API both want them. */
export async function loadFixtures(
  db: D1Database,
  where: { ids?: string[]; from?: string; to?: string; country?: string },
): Promise<LoadedFixture[]> {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (where.ids) {
    if (where.ids.length === 0) return [];
    clauses.push(`f.id IN (${marks(where.ids.length)})`);
    params.push(...where.ids);
  }
  if (where.from) (clauses.push("f.date >= ?"), params.push(where.from));
  if (where.to) (clauses.push("f.date <= ?"), params.push(where.to));
  if (where.country) (clauses.push("f.country_code = ?"), params.push(where.country));

  const { results: rows } = await db
    .prepare(`SELECT f.* FROM fixtures f ${clauses.length ? "WHERE " + clauses.join(" AND ") : ""} ORDER BY f.date, f.importance DESC`)
    .bind(...params)
    .all<FixtureRow>();
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
  const order: CrewRole[] = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"];
  return rows.map((r) => ({
    id: r.id,
    countryCode: r.country_code,
    competitionId: r.competition_id,
    matchday: r.matchday,
    date: r.date,
    kickoff: r.kickoff,
    home: r.home,
    away: r.away,
    city: r.city,
    venue: r.venue,
    importance: r.importance,
    risk: r.risk,
    played: r.played === 1,
    crew: (crews.get(r.id) ?? []).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)),
    homeCode: r.home_code,
    awayCode: r.away_code,
    designationStatus: r.designation_status,
  }));
}

export class DbEngineContext implements EngineContext {
  private referees: PoolEntry[] = [];
  private assistants: PoolEntry[] = [];
  private statusOf = new Map<string, string>();
  private zones = new Map<string, Zone>();
  private nations = new Map<string, string[]>();
  /** every placed (non-empty) designation in the window: official → [{fixtureId, date}] */
  private placed = new Map<string, Array<{ fixtureId: string; date: string }>>();
  private declared = new Map<string, AvailabilityState>();
  private conflicts = new Map<string, Array<{ kind: string; subject: string }>>();

  static async load(db: D1Database, from: string, to: string): Promise<DbEngineContext> {
    const ctx = new DbEngineContext();
    const lookback = addDays(from, -14);

    const [officials, countries, placed, declared, conflicts, nations] = await db.batch<Record<string, unknown>>([
      db.prepare(
        "SELECT id, kind, name, initials, country_code, status, var_qualified, rmcs_avg, fitness, trend FROM officials WHERE status <> 'retired'",
      ),
      db.prepare("SELECT code, zone FROM countries"),
      db.prepare(
        `SELECT d.official_id, d.fixture_id, f.date FROM designations d JOIN fixtures f ON f.id = d.fixture_id
          WHERE d.official_id IS NOT NULL AND d.state <> 'empty' AND f.date BETWEEN ? AND ?`,
      ).bind(lookback, to),
      db.prepare("SELECT official_id, date, state FROM availability WHERE date BETWEEN ? AND ?").bind(from, to),
      db.prepare("SELECT official_id, kind, subject FROM conflicts_of_interest"),
      db.prepare("SELECT id, home_code, away_code FROM fixtures WHERE date BETWEEN ? AND ? AND country_code = 'CAF'").bind(from, to),
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
    for (const p of placed.results as Array<{ official_id: string; fixture_id: string; date: string }>) {
      ctx.place(p.official_id, p.fixture_id, p.date);
    }
    for (const a of declared.results as Array<{ official_id: string; date: string; state: AvailabilityState }>) {
      ctx.declared.set(`${a.official_id}|${a.date}`, a.state);
    }
    for (const c of conflicts.results as Array<{ official_id: string; kind: string; subject: string }>) {
      const list = ctx.conflicts.get(c.official_id) ?? [];
      list.push({ kind: c.kind, subject: c.subject.toLowerCase() });
      ctx.conflicts.set(c.official_id, list);
    }
    for (const n of nations.results as Array<{ id: string; home_code: string | null; away_code: string | null }>) {
      if (n.home_code && n.away_code) ctx.nations.set(n.id, [n.home_code, n.away_code]);
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
  hasConflict(officialId: string, fixture: LoadedFixture | Fixture) {
    const list = this.conflicts.get(officialId);
    if (!list) return false;
    const f = fixture as LoadedFixture;
    const teams = [fixture.home.toLowerCase(), fixture.away.toLowerCase()];
    const nations = [f.homeCode, f.awayCode, fixture.countryCode].filter(Boolean).map((c) => c!.toLowerCase());
    return list.some((c) => (c.kind === "country" ? nations.includes(c.subject) : teams.includes(c.subject)));
  }
}
