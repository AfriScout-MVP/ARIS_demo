// `applySnapshot` is the only door through which data enters the store. It takes the body of
// `GET /api/v1/snapshot` and replaces the contents of every collection in place, so every
// importer keeps working and nothing downstream has to know where the data came from.

import { arpsTrend, criterionAverages, criterionAveragesByReferee, decisionsBreakdown } from "./analytics";
import { setToday } from "./clock";
import { competitionById, competitions, countries, countryByCode } from "./geography";
import { assistantById, assistants, refereeById, referees } from "./officials";
import { availabilityDeclared, fixtureById, fixtureNations, fixtures } from "./fixtures";
import { EMPTY_PHYSICAL, matchById, matches } from "./matches";
import {
  assessmentByMatch,
  assessments,
  courses,
  criteria,
  dossiers,
  fitnessByReferee,
  fitnessTests,
  licences,
} from "./assessments";
import type { ApiFixture, ApiSnapshot, Country, Fixture, Referee, Assistant } from "./types";

function replaceAll<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next);
}

function replaceMap<K, V>(target: Map<K, V>, entries: Iterable<[K, V]>) {
  target.clear();
  for (const [k, v] of entries) target.set(k, v);
}

/** Fill in the workflow fields an older or partial response may leave out. */
export function normalizeFixture(f: ApiFixture): Fixture {
  return {
    ...f,
    kickoffAt: f.kickoffAt ?? "",
    homeTeamId: f.homeTeamId ?? null,
    awayTeamId: f.awayTeamId ?? null,
    homeCode: f.homeCode ?? null,
    awayCode: f.awayCode ?? null,
    designationStatus: f.designationStatus ?? "draft",
    status: f.status ?? (f.played ? "played" : "scheduled"),
  };
}

const normalizeCountry = (c: Country): Country => ({
  ...c,
  flagUrl: c.flagUrl ?? null,
  active: c.active !== false,
  // an older API still sent the seeded "manual" status; only derived freshness is shown now
  syncHealth: c.syncHealth === "healthy" || c.syncHealth === "stale" ? c.syncHealth : "none",
  lastSyncHours: typeof c.lastSyncHours === "number" ? c.lastSyncHours : null,
});
const normalizeReferee = (r: Referee): Referee => ({ ...r, photoUrl: r.photoUrl ?? null });
const normalizeAssistant = (a: Assistant): Assistant => ({ ...a, photoUrl: a.photoUrl ?? null });

/** Replace everything the screens read with what the API returned. Call before the screens render. */
export function applySnapshot(s: ApiSnapshot) {
  setToday(s.today);

  replaceAll(countries, s.countries.map(normalizeCountry));
  replaceMap(countryByCode, countries.map((c) => [c.code, c]));
  replaceAll(competitions, s.competitions);
  replaceMap(competitionById, competitions.map((c) => [c.id, c]));
  replaceAll(referees, s.referees.map(normalizeReferee));
  replaceMap(refereeById, referees.map((r) => [r.id, r]));
  replaceAll(assistants, s.assistants.map(normalizeAssistant));
  replaceMap(assistantById, assistants.map((a) => [a.id, a]));

  const list = s.fixtures.map(normalizeFixture);
  fixtureNations.clear();
  for (const f of list) if (f.homeCode && f.awayCode) fixtureNations.set(f.id, [f.homeCode, f.awayCode]);
  replaceAll(fixtures, list.sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date.localeCompare(b.date))));
  replaceMap(fixtureById, fixtures.map((f) => [f.id, f]));

  replaceMap(availabilityDeclared, s.availability.map((a) => [`${a.officialId}|${a.date}`, a.state]));

  replaceAll(
    matches,
    s.matches.map((m) => ({
      ...m,
      physical: m.physical && "distanceKm" in m.physical ? m.physical : EMPTY_PHYSICAL,
      pressureTimeline: m.pressureTimeline ?? [],
      heatPoints: m.heatPoints ?? [],
      weather: m.weather ?? null,
    })),
  );
  replaceMap(matchById, matches.map((m) => [m.id, m]));

  replaceAll(assessments, s.assessments);
  replaceMap(assessmentByMatch, assessments.map((a) => [a.matchId, a]));
  // licences and fitness are tracked for referees; assistants' are managed in the back office
  replaceAll(licences, s.licences.filter((l) => refereeById.has(l.refereeId)));
  replaceAll(fitnessTests, s.fitnessTests.filter((f) => refereeById.has(f.refereeId)));
  replaceMap(fitnessByReferee, fitnessTests.map((f) => [f.refereeId, f]));
  replaceAll(courses, s.courses);
  replaceAll(dossiers, s.dossiers);
  replaceAll(criteria, s.criteria ?? []);

  replaceAll(arpsTrend, s.analytics?.arpsTrend ?? []);
  replaceAll(decisionsBreakdown, s.analytics?.decisionsBreakdown ?? []);
  replaceAll(criterionAverages, s.analytics?.criterionAverages ?? []);
  replaceMap(criterionAveragesByReferee, criterionAverages.map((r) => [r.refereeId, r]));
}

const EMPTY_SNAPSHOT: ApiSnapshot = {
  today: "",
  window: { from: "", to: "" },
  countries: [],
  competitions: [],
  referees: [],
  assistants: [],
  fixtures: [],
  matches: [],
  assessments: [],
  licences: [],
  fitnessTests: [],
  courses: [],
  dossiers: [],
  availability: [],
  criteria: [],
  analytics: { arpsTrend: [], decisionsBreakdown: [], criterionAverages: [] },
};

/** Forget everything: used on sign-out, so the next account never sees the previous one's data. */
export function resetStore() {
  applySnapshot(EMPTY_SNAPSHOT);
}
