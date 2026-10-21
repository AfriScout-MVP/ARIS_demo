// Tiny synthetic data for the store tests. Everything here is invented for the tests and is
// never shipped: the app itself holds no data at all.

import type {
  ApiFixture,
  ApiSnapshot,
  Assessment,
  Assistant,
  Competition,
  Country,
  CrewSlot,
  FitnessTest,
  Licence,
  Referee,
} from "@/lib/store";

export const TODAY = "2030-03-13"; // a Wednesday; its Monday is 2030-03-11

export function country(code: string, zone: Country["zone"], over: Partial<Country> = {}): Country {
  return {
    code,
    iso2: code.slice(0, 2),
    name: `${code} land`,
    nameFr: `${code} pays`,
    nameEs: `${code} país`,
    nameDe: `${code} Land`,
    flag: "🏳️",
    flagUrl: null,
    federation: `F${code}`,
    federationName: `Federation ${code}`,
    zone,
    capital: `${code} city`,
    timezone: "UTC",
    currency: "XXX",
    active: true,
    syncSource: "COMET",
    syncHealth: "healthy",
    lastSyncHours: 1,
    clubs: [`${code} A`, `${code} B`],
    ...over,
  };
}

export function referee(id: string, countryCode: string, over: Partial<Referee> = {}): Referee {
  return {
    id,
    name: `Ref ${id}`,
    initials: id.slice(0, 2).toUpperCase(),
    photoUrl: null,
    countryCode,
    city: "Town",
    level: "National D1",
    age: 30,
    yearsActive: 5,
    status: "active",
    arps: 80,
    rmcsAvg: 78,
    fitness: 85,
    matches: 90,
    cards: { yellow: 100, red: 5 },
    varAccuracy: 92,
    varQualified: false,
    trend: 1,
    bio: { fr: "bio fr", en: "bio en" },
    ...over,
  };
}

export function assistant(id: string, countryCode: string): Assistant {
  return { id, name: `Asst ${id}`, initials: "AA", photoUrl: null, countryCode, level: "Regional", rating: 75 };
}

export function competition(id: string, countryCode: string, over: Partial<Competition> = {}): Competition {
  return { id, countryCode, name: `Comp ${id}`, tier: "d1", gender: "M", matchdays: 30, currentMatchday: 5, varEnabled: false, weight: 50, ...over };
}

export const emptyCrew = (): CrewSlot[] => [
  { role: "R", officialId: null, state: "empty" },
  { role: "AR1", officialId: null, state: "empty" },
  { role: "AR2", officialId: null, state: "empty" },
  { role: "FOURTH", officialId: null, state: "empty" },
];

export function fixture(id: string, countryCode: string, date: string, over: Partial<ApiFixture> = {}): ApiFixture {
  return {
    id,
    countryCode,
    competitionId: `${countryCode.toLowerCase()}-d1`,
    matchday: 1,
    date,
    kickoff: "18:00",
    home: `${id} home`,
    away: `${id} away`,
    city: "Town",
    venue: "Ground",
    importance: 50,
    risk: "low",
    crew: emptyCrew(),
    played: false,
    ...over,
  };
}

export function crew(...picks: Array<[CrewSlot["role"], string | null, CrewSlot["state"]]>): CrewSlot[] {
  return picks.map(([role, officialId, state]) => ({ role, officialId, state }));
}

export function licence(id: string, refereeId: string, kind: Licence["kind"], expires: string): Licence {
  return { id, refereeId, kind, issued: "2029-01-01", expires };
}

export function fitness(refereeId: string, ok: boolean): FitnessTest {
  return {
    refereeId,
    date: "2029-12-01",
    test1: { result: ok ? "passed" : "failed", bestSprint: 6 },
    test2: { result: ok ? "passed" : "failed", laps: 40 },
    retestDate: null,
  };
}

export function assessment(id: string, refereeId: string, state: Assessment["state"] = "filed"): Assessment {
  return {
    id,
    matchId: `m-${id}`,
    refereeId,
    observerId: "obs",
    state,
    filedHoursAfter: 10,
    overall: 8,
    marks: { positioning: 8, decisions: 8, gameManagement: 8, teamwork: 8, discipline: 8, fitness: 8 },
    notes: { fr: "n", en: "n" },
    clips: [],
  };
}

/** A two-country snapshot: AAA (zone UNAF) and BBB (zone COSAFA), plus the `CAF` competition. */
export function snapshot(over: Partial<ApiSnapshot> = {}): ApiSnapshot {
  return {
    today: TODAY,
    window: { from: "2030-02-20", to: "2030-04-17" },
    countries: [country("AAA", "UNAF"), country("BBB", "COSAFA", { flagUrl: "/api/v1/media/flag-b" })],
    competitions: [competition("aaa-d1", "AAA"), competition("bbb-d1", "BBB"), competition("caf-x", "CAF", { tier: "continental", varEnabled: true })],
    referees: [
      referee("r1", "AAA", { arps: 90, level: "CAF Elite", trend: 2 }),
      referee("r2", "AAA", { arps: 70, trend: -1 }),
      referee("r3", "BBB", { arps: 85, level: "FIFA Listed", varQualified: true, varAccuracy: 95 }),
    ],
    assistants: [assistant("a1", "AAA"), assistant("a2", "BBB")],
    fixtures: [],
    matches: [],
    assessments: [],
    licences: [],
    fitnessTests: [],
    courses: [],
    dossiers: [],
    availability: [],
    criteria: [],
    analytics: { arpsTrend: [], decisionsBreakdown: [] },
    ...over,
  };
}
