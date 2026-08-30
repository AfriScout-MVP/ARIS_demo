// The rules a referee committee actually applies when it fills a slot:
// neutrality, the appointing list, availability, rest, qualification. Everything
// the assignment engine surfaces comes from here, so the AI screen and the
// manual board can never disagree with each other.

import {
  assistants,
  availabilityFor,
  countryByCode,
  fixtureNations,
  referees,
  restDays,
  type CrewRole,
  type CrewSlot,
  type Fixture,
} from "./mock-data";

export type BlockerId =
  | "neutrality"
  | "pool"
  | "unavailable"
  | "rest"
  | "qualification"
  | "duplicate";

export interface Candidate {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  kind: "referee" | "assistant";
  score: number;
  rating: number;
  fitness: number;
  travelHours: number;
  rest: number;
  frictionRisk: "low" | "medium" | "high";
  h2h: number;
  /** True when this official is only available because the home list ran short. */
  cover: boolean;
  blockers: BlockerId[];
}

/** Continental ties are hosted by the home side's country. */
export function hostCountry(fixture: Fixture) {
  if (fixture.countryCode !== "CAF") return fixture.countryCode;
  return fixtureNations.get(fixture.id)?.[0] ?? fixture.countryCode;
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function travelHours(fromCode: string, toCode: string) {
  if (fromCode === toCode) return 0.5;
  const from = countryByCode.get(fromCode);
  const to = countryByCode.get(toCode);
  const jitter = (hashCode(fromCode + toCode) % 20) / 10;
  if (from && to && from.zone === to.zone) return Math.round((2.2 + jitter) * 10) / 10;
  return Math.round((5.4 + jitter * 2) * 10) / 10;
}

/** Roles a referee fills; the rest are assistant-referee roles. */
export function roleWantsReferee(role: CrewRole) {
  return role === "R" || role === "VAR" || role === "AVAR" || role === "OBS";
}

interface PoolEntry {
  id: string;
  name: string;
  initials: string;
  countryCode: string;
  kind: "referee" | "assistant";
  rating: number;
  fitness: number;
  suspended: boolean;
  varQualified: boolean;
  trend: number;
}

function poolFor(role: CrewRole): PoolEntry[] {
  if (roleWantsReferee(role)) {
    return referees.map((r) => ({
      id: r.id,
      name: r.name,
      initials: r.initials,
      countryCode: r.countryCode,
      kind: "referee" as const,
      rating: r.rmcsAvg,
      fitness: r.fitness,
      suspended: r.status === "suspended",
      varQualified: r.varQualified,
      trend: r.trend,
    }));
  }
  return assistants.map((a) => ({
    id: a.id,
    name: a.name,
    initials: a.initials,
    countryCode: a.countryCode,
    kind: "assistant" as const,
    rating: a.rating,
    fitness: 80,
    suspended: false,
    varQualified: false,
    trend: 0,
  }));
}

/** Blockers that have nothing to do with which list an official belongs to. */
function personalBlockers(
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
  if (availabilityFor(entry.id, fixture.date) === "unavailable") blockers.push("unavailable");
  if (restDays(entry.id, fixture.date) < 3) blockers.push("rest");
  if (taken.has(entry.id)) blockers.push("duplicate");
  return blockers;
}

/**
 * Ranks every official in the pool for one slot. Ineligible officials stay in
 * the list with the reason attached — hiding them is how an assignor ends up
 * asking "why isn't so-and-so here?" with no answer on screen.
 */
export function candidatesForSlot(fixture: Fixture, role: CrewRole, crew: CrewSlot[]): Candidate[] {
  const host = hostCountry(fixture);
  const domestic = fixture.countryCode !== "CAF";
  const involved = domestic ? [fixture.countryCode] : (fixtureNations.get(fixture.id) ?? []);
  const taken = new Set(crew.filter((s) => s.role !== role && s.officialId).map((s) => s.officialId));
  const pool = poolFor(role);
  const homeZone = countryByCode.get(host)?.zone;

  // A domestic fixture is staffed from its own federation's list. When that
  // list cannot cover the slot — a small corps, a thin VAR bench — cover
  // widens one step at a time: home federation, then zone, then the continent.
  // A slot the desk cannot fill from anywhere is not a rule, it is a dead end.
  const canCover = (where: (code: string) => boolean) =>
    pool.some(
      (entry) => where(entry.countryCode) && personalBlockers(entry, fixture, role, taken).length === 0,
    );

  const homeCanCover = !domestic || canCover((code) => code === fixture.countryCode);
  const zoneCanCover =
    homeCanCover || canCover((code) => countryByCode.get(code)?.zone === homeZone);

  return pool
    .map<Candidate>((entry) => {
      const blockers = personalBlockers(entry, fixture, role, taken);
      let cover = false;

      if (domestic) {
        if (entry.countryCode !== fixture.countryCode) {
          const sameZone = countryByCode.get(entry.countryCode)?.zone === homeZone;
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

      const travel = travelHours(entry.countryCode, host);
      const rest = restDays(entry.id, fixture.date);
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

export const blockerKey: Record<
  BlockerId,
  | "calendar.ineligibleNeutrality"
  | "calendar.ineligibleUnavailable"
  | "calendar.ineligibleRest"
  | "calendar.ineligiblePool"
  | "calendar.ineligibleDuplicate"
  | "calendar.ineligibleQualification"
> = {
  neutrality: "calendar.ineligibleNeutrality",
  pool: "calendar.ineligiblePool",
  unavailable: "calendar.ineligibleUnavailable",
  rest: "calendar.ineligibleRest",
  qualification: "calendar.ineligibleQualification",
  duplicate: "calendar.ineligibleDuplicate",
};

/** Best legal pick for a slot, or null when nobody is eligible. */
export function bestCandidate(fixture: Fixture, role: CrewRole, crew: CrewSlot[]): Candidate | null {
  const eligible = candidatesForSlot(fixture, role, crew).filter((c) => c.blockers.length === 0);
  return eligible[0] ?? null;
}
