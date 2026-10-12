// The browser's binding of the shared designation engine (`./core/engine`) to
// the data the app holds in memory. Screens import from here; the rules
// themselves live in core, where the Worker enforces the very same code.

import {
  assistants,
  availabilityFor,
  countryByCode,
  fixtures,
  fixtureNations,
  referees,
  restDays,
  type CrewRole,
  type CrewSlot,
  type Fixture,
} from "./mock-data";
import {
  bestCandidate as coreBestCandidate,
  candidatesForSlot as coreCandidatesForSlot,
  hostCountry as coreHostCountry,
  roleWantsReferee,
  travelHours as coreTravelHours,
  type EngineContext,
} from "./core/engine";
import type { BlockerId, Candidate, PoolEntry } from "./core/types";

export type { BlockerId, Candidate };
export { roleWantsReferee };

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

export const appContext: EngineContext = {
  pool: poolFor,
  zoneOf: (code) => countryByCode.get(code)?.zone,
  nationsOf: (fixture) => fixtureNations.get(fixture.id) ?? [],
  availability: availabilityFor,
  restDays,
  busyElsewhere: (officialId, fixture) =>
    fixtures.some(
      (f) =>
        f.id !== fixture.id &&
        f.date === fixture.date &&
        f.crew.some((s) => s.officialId === officialId && s.state !== "empty"),
    ),
  // The demo carries no declared conflicts of interest.
  hasConflict: () => false,
};

export const hostCountry = (fixture: Fixture) => coreHostCountry(appContext, fixture);
export const travelHours = (fromCode: string, toCode: string) => coreTravelHours(appContext, fromCode, toCode);
export const candidatesForSlot = (fixture: Fixture, role: CrewRole, crew: CrewSlot[]) =>
  coreCandidatesForSlot(appContext, fixture, role, crew);
export const bestCandidate = (fixture: Fixture, role: CrewRole, crew: CrewSlot[]) =>
  coreBestCandidate(appContext, fixture, role, crew);

export const blockerKey: Record<
  BlockerId,
  | "calendar.ineligibleNeutrality"
  | "calendar.ineligibleUnavailable"
  | "calendar.ineligibleRest"
  | "calendar.ineligiblePool"
  | "calendar.ineligibleDuplicate"
  | "calendar.ineligibleQualification"
  | "calendar.ineligibleDouble"
  | "calendar.ineligibleConflict"
> = {
  neutrality: "calendar.ineligibleNeutrality",
  pool: "calendar.ineligiblePool",
  unavailable: "calendar.ineligibleUnavailable",
  rest: "calendar.ineligibleRest",
  qualification: "calendar.ineligibleQualification",
  duplicate: "calendar.ineligibleDuplicate",
  double: "calendar.ineligibleDouble",
  conflict: "calendar.ineligibleConflict",
};
