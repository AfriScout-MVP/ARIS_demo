// The rules a referee committee actually applies when it fills a slot:
// neutrality, the appointing list, availability, rest, qualification.
//
// This file is pure. The browser runs it to suggest, the Worker runs it to
// enforce — so a screen can never offer a crew the server would refuse. Every
// lookup it needs (who exists, who is free, how rested they are) comes in
// through an `EngineContext`.

import type {
  AvailabilityState,
  BlockerId,
  Candidate,
  CrewRole,
  CrewSlot,
  Fixture,
  PoolEntry,
  Zone,
} from "./types";

export interface EngineContext {
  /** Everyone who could fill a referee-type or assistant-type role. */
  pool(role: CrewRole): PoolEntry[];
  zoneOf(countryCode: string): Zone | undefined;
  /** The two nations on a continental tie, host first; empty for domestic fixtures. */
  nationsOf(fixture: Fixture): string[];
  availability(officialId: string, date: string): AvailabilityState;
  /** Days since this official's last appointment before `date`. */
  restDays(officialId: string, date: string): number;
  /** True when the official already holds a role on a *different* match that day. */
  busyElsewhere(officialId: string, fixture: Fixture): boolean;
  /** True when the official declared a conflict of interest with this match. */
  hasConflict(officialId: string, fixture: Fixture): boolean;
}

/** Roles a referee fills; the rest are assistant-referee roles. */
export function roleWantsReferee(role: CrewRole) {
  return role === "R" || role === "VAR" || role === "AVAR" || role === "OBS";
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** Continental ties are hosted by the home side's country. */
export function hostCountry(ctx: EngineContext, fixture: Fixture) {
  if (fixture.countryCode !== "CAF") return fixture.countryCode;
  return ctx.nationsOf(fixture)[0] ?? fixture.countryCode;
}

export function travelHours(ctx: EngineContext, fromCode: string, toCode: string) {
  if (fromCode === toCode) return 0.5;
  const from = ctx.zoneOf(fromCode);
  const to = ctx.zoneOf(toCode);
  const jitter = (hashCode(fromCode + toCode) % 20) / 10;
  if (from && to && from === to) return Math.round((2.2 + jitter) * 10) / 10;
  return Math.round((5.4 + jitter * 2) * 10) / 10;
}

/** Blockers that have nothing to do with which list an official belongs to. */
function personalBlockers(
  ctx: EngineContext,
  entry: PoolEntry,
  fixture: Fixture,
  role: CrewRole,
  taken: Set<string | null>,
): BlockerId[] {
  const blockers: BlockerId[] = [];
  if (entry.suspended) blockers.push("qualification");
  if ((role === "VAR" || role === "AVAR") && entry.kind === "referee" && !entry.varQualified) {
    blockers.push("qualification");
  }
  if (ctx.availability(entry.id, fixture.date) === "unavailable") blockers.push("unavailable");
  if (ctx.restDays(entry.id, fixture.date) < 3) blockers.push("rest");
  if (taken.has(entry.id)) blockers.push("duplicate");
  if (ctx.busyElsewhere(entry.id, fixture)) blockers.push("double");
  if (ctx.hasConflict(entry.id, fixture)) blockers.push("conflict");
  return blockers;
}

/**
 * Ranks every official in the pool for one slot. Ineligible officials stay in
 * the list with the reason attached — hiding them is how an assignor ends up
 * asking "why isn't so-and-so here?" with no answer on screen.
 */
export function candidatesForSlot(
  ctx: EngineContext,
  fixture: Fixture,
  role: CrewRole,
  crew: CrewSlot[],
): Candidate[] {
  const host = hostCountry(ctx, fixture);
  const domestic = fixture.countryCode !== "CAF";
  const involved = domestic ? [fixture.countryCode] : ctx.nationsOf(fixture);
  const taken = new Set(crew.filter((s) => s.role !== role && s.officialId).map((s) => s.officialId));
  const pool = ctx.pool(role);
  const homeZone = ctx.zoneOf(host);

  // A domestic fixture is staffed from its own federation's list. When that
  // list cannot cover the slot — a small corps, a thin VAR bench — cover
  // widens one step at a time: home federation, then zone, then the continent.
  // A slot the desk cannot fill from anywhere is not a rule, it is a dead end.
  const canCover = (where: (code: string) => boolean) =>
    pool.some(
      (entry) => where(entry.countryCode) && personalBlockers(ctx, entry, fixture, role, taken).length === 0,
    );

  const homeCanCover = !domestic || canCover((code) => code === fixture.countryCode);
  const zoneCanCover = homeCanCover || canCover((code) => ctx.zoneOf(code) === homeZone);

  return pool
    .map<Candidate>((entry) => {
      const blockers = personalBlockers(ctx, entry, fixture, role, taken);
      let cover = false;

      if (domestic) {
        if (entry.countryCode !== fixture.countryCode) {
          const sameZone = ctx.zoneOf(entry.countryCode) === homeZone;
          if (homeCanCover) {
            blockers.push("pool");
          } else if (zoneCanCover && !sameZone) {
            blockers.push("pool");
          } else {
            cover = true;
          }
        }
      } else if (involved.includes(entry.countryCode)) {
        blockers.push("neutrality");
      }

      const travel = travelHours(ctx, entry.countryCode, host);
      const rest = ctx.restDays(entry.id, fixture.date);
      const h2h = entry.kind === "referee" ? hashCode(entry.id + fixture.home + fixture.away) % 7 : 0;
      const friction: Candidate["frictionRisk"] = h2h >= 5 ? "high" : h2h >= 3 ? "medium" : "low";

      const score =
        entry.rating * 0.52 +
        entry.fitness * 0.18 +
        Math.min(rest, 10) * 1.4 +
        (10 - Math.min(travel, 10)) * 0.9 +
        entry.trend * 0.6 -
        (friction === "high" ? 6 : friction === "medium" ? 2.5 : 0) -
        (cover ? 3 : 0);

      return {
        id: entry.id,
        name: entry.name,
        initials: entry.initials,
        countryCode: entry.countryCode,
        kind: entry.kind,
        score: Math.round(score * 10) / 10,
        rating: entry.rating,
        fitness: entry.fitness,
        travelHours: travel,
        rest,
        frictionRisk: friction,
        h2h,
        cover,
        blockers,
      };
    })
    .sort((a, b) => {
      if (a.blockers.length !== b.blockers.length) return a.blockers.length - b.blockers.length;
      return b.score - a.score;
    });
}

/** Best legal pick for a slot, or null when nobody is eligible. */
export function bestCandidate(
  ctx: EngineContext,
  fixture: Fixture,
  role: CrewRole,
  crew: CrewSlot[],
): Candidate | null {
  const eligible = candidatesForSlot(ctx, fixture, role, crew).filter((c) => c.blockers.length === 0);
  return eligible[0] ?? null;
}

/**
 * Why a proposed (role, official) pairing is not legal — empty when it is.
 * The Worker calls this before it writes a designation.
 */
export function blockersFor(
  ctx: EngineContext,
  fixture: Fixture,
  role: CrewRole,
  officialId: string,
  crew: CrewSlot[],
): BlockerId[] | null {
  const entry = candidatesForSlot(ctx, fixture, role, crew).find((c) => c.id === officialId);
  return entry ? entry.blockers : null;
}
