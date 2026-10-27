// ARIS — the demo dataset the seed script (scripts/seed) turns into SQL for D1.
//
// Two layers:
//   • ./real-world.ts holds FACTS — the three supported federations, their competitions, clubs and stadiums,
//     as they exist. Nothing in it is invented.
//   • this file GENERATES everything that would be personal or confidential in a real deployment — the officials,
//     their records, the calendar's crews, results, decisions, reports — from those facts, deterministically.
//
// Every person generated here is FICTIONAL: names are drawn from common given names and surnames of each country
// and checked against a list of real referees (see REAL_OFFICIALS in ./real-world.ts) so no real official is
// impersonated. Players are referred to by shirt number only.

import type { AvailabilityState, CrewRole, CrewSlot, Fixture, SlotState, Zone } from "@core/types";
import { crewRoles } from "@core/types";
import { COUNTRY_FACTS, REAL_OFFICIALS, type ClubFact, type CountryFact } from "./real-world";

export type { AvailabilityState, CrewRole, CrewSlot, Fixture, SlotState, Zone };
export { crewRoles };

/** A Monday: the demo's "this week". The seed script shifts every date so this lands on the anchor week. */
export const DEMO_TODAY = "2026-08-31";

/**
 * How far into the demo week "now" is. The seed script's default anchor is the Monday of the current week, so
 * this is today's weekday (Monday = 0): a fixture already behind us is played, with its result and report, and
 * only what is still ahead is open. ARIS_SEED_DAYS_INTO_WEEK overrides it (0 to 6) when seeding another week.
 */
export const DAYS_INTO_WEEK = (() => {
  const env = Number(process.env.ARIS_SEED_DAYS_INTO_WEEK);
  return Number.isInteger(env) && env >= 0 && env <= 6 ? env : (new Date().getUTCDay() + 6) % 7;
})();
/** "Now", in demo dates. */
export const DEMO_NOW = addDays(DEMO_TODAY, DAYS_INTO_WEEK);

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const round1 = (n: number) => Math.round(n * 10) / 10;
const clampN = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** A roughly normal draw in [-1, 1]. */
const bell = (r: () => number) => (r() + r() + r() - 1.5) / 1.5;

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/* ------------------------------------------------------------------ *
 * Geography — straight from the facts
 * ------------------------------------------------------------------ */

export type SyncHealth = "healthy" | "stale" | "manual";

export interface Country {
  code: string;
  name: string;
  nameFr: string;
  flag: string;
  federation: string;
  zone: Zone;
  capital: string;
  syncSource: "COMET" | "League feed" | "Manual entry";
  syncHealth: SyncHealth;
  lastSyncHours: number;
  /** Top-flight clubs, by name. */
  clubs: string[];
  fact: CountryFact;
}

export const countries: Country[] = COUNTRY_FACTS.map((f) => ({
  code: f.code,
  name: f.name,
  nameFr: f.nameFr,
  flag: f.flag,
  federation: f.federation.code,
  zone: f.zone,
  capital: f.capital,
  syncSource: f.syncSource,
  syncHealth: f.syncSource === "Manual entry" ? "manual" : "healthy",
  lastSyncHours: f.syncSource === "Manual entry" ? 30 : 1 + (hash(f.code) % 6),
  clubs: f.league.clubs.map((c) => c.name),
  fact: f,
}));

export const countryByCode = new Map(countries.map((c) => [c.code, c]));

/** Every club the dataset knows, with the country it plays in. */
export const clubs: Array<ClubFact & { countryCode: string }> = COUNTRY_FACTS.flatMap((f) => f.league.clubs.map((c) => ({ ...c, countryCode: f.code })));
const clubByName = new Map(clubs.map((c) => [c.name, c]));

/** Stadiums, with capacity, keyed by name within a country. */
export const stadiums = COUNTRY_FACTS.flatMap((f) => f.stadiums.map((s) => ({ ...s, countryCode: f.code })));
const stadiumByName = new Map(stadiums.map((s) => [`${s.countryCode}|${s.name}`, s]));

export function stadiumFact(countryCode: string, name: string) {
  return stadiumByName.get(`${countryCode}|${name}`);
}

/* ------------------------------------------------------------------ *
 * Competitions
 * ------------------------------------------------------------------ */

export type CompetitionTier = "d1" | "d2" | "cup" | "continental";

export interface Competition {
  id: string;
  countryCode: string;
  name: string;
  shortName: string;
  tier: CompetitionTier;
  gender: "M" | "W";
  matchdays: number;
  currentMatchday: number;
  varEnabled: boolean;
  /** Weight used for fixture importance. */
  weight: number;
}

/** League rounds already played when the demo week starts, and the rounds scheduled from it. */
const PLAYED_ROUNDS = 5;
const SCHEDULED_ROUNDS = 4;

export const competitions: Competition[] = [
  ...COUNTRY_FACTS.flatMap<Competition>((f) => [
    {
      id: `${f.code.toLowerCase()}-d1`,
      countryCode: f.code,
      name: f.league.name,
      shortName: f.league.shortName,
      tier: "d1",
      gender: "M",
      matchdays: (f.league.clubs.length - 1) * 2,
      currentMatchday: PLAYED_ROUNDS + 1,
      varEnabled: f.league.varEnabled,
      weight: 55,
    },
    {
      id: `${f.code.toLowerCase()}-cup`,
      countryCode: f.code,
      name: f.cup.name,
      shortName: f.cup.shortName,
      tier: "cup",
      gender: "M",
      matchdays: 6,
      currentMatchday: 2,
      varEnabled: false,
      weight: 50,
    },
  ]),
  { id: "caf-cl", countryCode: "CAF", name: "CAF Champions League", shortName: "CAF CL", tier: "continental", gender: "M", matchdays: 2, currentMatchday: 2, varEnabled: false, weight: 88 },
  { id: "caf-cc", countryCode: "CAF", name: "CAF Confederation Cup", shortName: "CAF CC", tier: "continental", gender: "M", matchdays: 2, currentMatchday: 2, varEnabled: false, weight: 78 },
  { id: "afcon-q", countryCode: "CAF", name: "AFCON 2027 Qualifiers", shortName: "AFCON Q", tier: "continental", gender: "M", matchdays: 6, currentMatchday: 3, varEnabled: true, weight: 92 },
];

export const competitionById = new Map(competitions.map((c) => [c.id, c]));

/* ------------------------------------------------------------------ *
 * Officials — generated, fictional
 * ------------------------------------------------------------------ */

export type RefereeStatus = "active" | "suspended" | "training" | "elite-pool";
export type RefereeLevel = "CAF Elite" | "FIFA Listed" | "National D1" | "Regional";

export interface Referee {
  id: string;
  name: string;
  initials: string;
  gender: "M" | "F";
  countryCode: string;
  city: string;
  level: RefereeLevel;
  age: number;
  yearsActive: number;
  status: RefereeStatus;
  arps: number;
  rmcsAvg: number;
  fitness: number;
  matches: number;
  cards: { yellow: number; red: number };
  varAccuracy: number;
  varQualified: boolean;
  trend: number;
  bio: { en: string; fr: string };
}

export interface Assistant {
  id: string;
  name: string;
  initials: string;
  gender: "M" | "F";
  countryCode: string;
  city: string;
  level: "FIFA Listed" | "National D1" | "Regional";
  age: number;
  yearsActive: number;
  rating: number;
  fitness: number;
}

/** How many officials each federation's top-flight list carries (the corps is far larger; this is the D1 panel). */
const PANEL = { referees: 18, assistants: 34 };
/** Of the referee panel: how many sit on the FIFA list, and of those how many on the CAF elite panel. */
const FIFA_REFEREES = 6;
const ELITE_REFEREES = 2;
const FIFA_ASSISTANTS = 7;

const realNames = new Set(REAL_OFFICIALS.map((n) => slug(n)));
const usedNames = new Set<string>();

function personName(r: () => number, f: CountryFact, gender: "M" | "F") {
  for (let guard = 0; guard < 200; guard++) {
    const given = pick(r, gender === "M" ? f.names.male : f.names.female);
    const family = pick(r, f.names.surnames);
    const name = `${given} ${family}`;
    const key = slug(name);
    if (realNames.has(key) || usedNames.has(key)) continue;
    usedNames.add(key);
    return name;
  }
  throw new Error(`Ran out of names for ${f.code}`);
}

const initialsOf = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter((p) => /^\p{Lu}/u.test(p))
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

const LEVEL_BASE: Record<RefereeLevel, { arps: number; age: number; years: number; matches: number }> = {
  "CAF Elite": { arps: 90, age: 38, years: 15, matches: 190 },
  "FIFA Listed": { arps: 86, age: 34, years: 11, matches: 135 },
  "National D1": { arps: 81, age: 31, years: 7, matches: 85 },
  Regional: { arps: 75, age: 27, years: 4, matches: 40 },
};

function refereeBio(ref: Omit<Referee, "bio">, f: CountryFact): Referee["bio"] {
  const league = f.league.shortName;
  const she = ref.gender === "F";
  if (ref.status === "suspended")
    return {
      en: `Off the appointment list while the disciplinary committee reviews a conduct complaint from a ${league} fixture.`,
      fr: `Retiré${she ? "e" : ""} des désignations le temps que la commission de discipline examine une plainte après une rencontre de ${league}.`,
    };
  if (ref.level === "CAF Elite")
    return {
      en: `On the CAF elite panel; ${f.federation.code}'s first choice for continental ties and the ${league} title-deciders.`,
      fr: `Membre du panel élite de la CAF ; premier choix de la ${f.federation.code} pour les rencontres continentales et les chocs de ${league}.`,
    };
  if (ref.level === "FIFA Listed")
    return ref.trend >= 2
      ? { en: `FIFA-listed and climbing: one of the steadiest marks in ${league} this season.`, fr: `Inscrit${she ? "e" : ""} sur la liste FIFA et en progression : l'une des notes les plus régulières de ${league} cette saison.` }
      : { en: `FIFA-listed since ${2026 - Math.min(ref.yearsActive, 8)}; trusted with high-pressure ${league} fixtures.`, fr: `Sur la liste FIFA depuis ${2026 - Math.min(ref.yearsActive, 8)} ; désigné${she ? "e" : ""} sur les rencontres sous tension de ${league}.` };
  if (ref.status === "training")
    return {
      en: `On the federation's development track; next step is the FIFA list if the fitness and observer marks hold.`,
      fr: `En parcours de développement fédéral ; prochaine étape, la liste FIFA si les notes physiques et d'observation se confirment.`,
    };
  return ref.fitness >= 88
    ? { en: `Among the best physical scores on the ${f.federation.code} panel; reads transitions early.`, fr: `Parmi les meilleures notes physiques du panel ${f.federation.code} ; anticipe bien les transitions.` }
    : { en: `Reliable ${league} referee, usually appointed to mid-table fixtures in ${ref.city}.`, fr: `Arbitre fiable de ${league}, désigné${she ? "e" : ""} le plus souvent sur les rencontres de milieu de tableau à ${ref.city}.` };
}

function buildReferees(f: CountryFact): Referee[] {
  const r = rng(hash(`${f.code}-referees`));
  return Array.from({ length: PANEL.referees }, (_, i) => {
    const level: RefereeLevel = i < ELITE_REFEREES ? "CAF Elite" : i < FIFA_REFEREES ? "FIFA Listed" : i < PANEL.referees - 4 ? "National D1" : "Regional";
    // women are about one referee in six on these panels
    const gender = i % 6 === 3 ? "F" : "M";
    const name = personName(r, f, gender);
    const base = LEVEL_BASE[level];
    const age = Math.round(base.age + bell(r) * 3);
    const yearsActive = clampN(Math.round(base.years + bell(r) * 3), 2, age - 20);
    const status: RefereeStatus = level === "CAF Elite" ? "elite-pool" : level === "Regional" && r() > 0.4 ? "training" : "active";
    const arps = round1(clampN(base.arps + bell(r) * 3, 68, 96));
    const fitness = Math.round(clampN(96 - (age - 25) * 0.9 + bell(r) * 6, 66, 97));
    const matches = Math.round(base.matches * (0.8 + r() * 0.4));
    const yellowPerMatch = 2.6 + r() * 1.2;
    const ref: Omit<Referee, "bio"> = {
      id: slug(name),
      name,
      initials: initialsOf(name),
      gender,
      countryCode: f.code,
      city: pick(r, f.officialCities),
      level,
      age,
      yearsActive,
      status,
      arps,
      rmcsAvg: round1(clampN(arps - 2 + bell(r) * 2, 60, 95)),
      fitness,
      matches,
      cards: { yellow: Math.round(matches * yellowPerMatch), red: Math.round(matches * (0.08 + r() * 0.08)) },
      varAccuracy: round1(clampN(arps + 5 + bell(r) * 2, 84, 98.5)),
      varQualified: level === "CAF Elite" || (level === "FIFA Listed" && r() > 0.35),
      trend: round1(level === "Regional" ? 2 + r() * 6 : bell(r) * 3 + 0.8),
    };
    return { ...ref, bio: refereeBio(ref, f) };
  });
}

function buildAssistants(f: CountryFact): Assistant[] {
  const r = rng(hash(`${f.code}-assistants`));
  return Array.from({ length: PANEL.assistants }, (_, i) => {
    const level: Assistant["level"] = i < FIFA_ASSISTANTS ? "FIFA Listed" : i < PANEL.assistants - 8 ? "National D1" : "Regional";
    const gender = i % 5 === 2 ? "F" : "M";
    const name = personName(r, f, gender);
    const age = Math.round((level === "FIFA Listed" ? 33 : level === "National D1" ? 30 : 26) + bell(r) * 3);
    return {
      id: slug(name),
      name,
      initials: initialsOf(name),
      gender,
      countryCode: f.code,
      city: pick(r, f.officialCities),
      level,
      age,
      yearsActive: clampN(Math.round(age - 23 + bell(r) * 2), 1, 20),
      rating: Math.round(clampN((level === "FIFA Listed" ? 86 : level === "National D1" ? 80 : 74) + bell(r) * 4, 65, 95)),
      fitness: Math.round(clampN(95 - (age - 25) * 0.8 + bell(r) * 5, 68, 97)),
    };
  });
}

export const referees: Referee[] = COUNTRY_FACTS.flatMap(buildReferees);
export const assistants: Assistant[] = COUNTRY_FACTS.flatMap(buildAssistants);

// One referee in the demo is suspended — the Côte d'Ivoire list's last national referee — so the discipline module
// has a real case to show. The case itself is written by the seed script (writeSuspensionCase).
{
  const target = referees.filter((x) => x.countryCode === "CIV" && x.level === "National D1").at(-1);
  if (target) {
    target.status = "suspended";
    target.trend = -4.6;
    target.arps = round1(target.arps - 5);
    target.bio = refereeBio(target, countryByCode.get("CIV")!.fact);
  }
}

export const refereeById = new Map(referees.map((r) => [r.id, r]));
export const assistantById = new Map(assistants.map((a) => [a.id, a]));

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

/** Mondays of every week the demo covers, from the league's opening round to four weeks ahead. */
const weekStart = (offset: number) => addDays(DEMO_TODAY, offset * 7);

/** Clubs a continental fixture involves, by nation — used for the neutrality check. */
export const fixtureNations = new Map<string, string[]>();

/** Round-robin pairings by the circle method; every club meets every other once per half-season. */
function roundRobin(teams: string[]): Array<Array<[string, string]>> {
  const list = teams.length % 2 ? [...teams, "BYE"] : [...teams];
  const n = list.length;
  const rounds: Array<Array<[string, string]>> = [];
  for (let k = 0; k < n - 1; k++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === "BYE" || b === "BYE") continue;
      // alternate home and away so no club plays three at home in a row
      pairs.push((k + i) % 2 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

interface DraftFixture extends Fixture {
  week: number;
}

function homeVenue(home: string, countryCode: string) {
  const club = clubByName.get(home);
  const stadium = club?.stadium ?? countryByCode.get(countryCode)!.fact.stadiums[0].name;
  const city = stadiumFact(countryCode, stadium)?.city ?? club?.city ?? countryByCode.get(countryCode)!.capital;
  return { stadium, city };
}

function importanceOf(comp: Competition, home: string, away: string, r: () => number) {
  const f = countryByCode.get(comp.countryCode)?.fact;
  const derby = f?.derbies.some(([a, b]) => (a === home && b === away) || (a === away && b === home)) ?? false;
  const big = (name: string) => clubByName.get(name)?.big ?? false;
  const value = comp.weight + (derby ? 28 : 0) + (big(home) ? 8 : 0) + (big(away) ? 8 : 0) + r() * 12;
  return { importance: Math.round(clampN(value, 35, 98)), derby };
}

const riskOf = (importance: number, derby: boolean): Fixture["risk"] => (derby || importance >= 82 ? "high" : importance >= 66 ? "medium" : "low");

function buildLeagueFixtures(): DraftFixture[] {
  const out: DraftFixture[] = [];
  for (const comp of competitions.filter((c) => c.tier === "d1")) {
    const f = countryByCode.get(comp.countryCode)!.fact;
    const rounds = roundRobin(f.league.clubs.map((c) => c.name)).slice(0, PLAYED_ROUNDS + SCHEDULED_ROUNDS);
    rounds.forEach((pairs, ri) => {
      const week = ri - PLAYED_ROUNDS; // round 1 is five weeks before the demo week
      const r = rng(hash(`${comp.id}-r${ri}`));
      // a shared ground hosts one match a day: stagger the days, then the kickoffs
      const groundDays = new Map<string, number>();
      pairs.forEach(([home, away], i) => {
        const { stadium, city } = homeVenue(home, comp.countryCode);
        const nth = groundDays.get(stadium) ?? 0;
        groundDays.set(stadium, nth + 1);
        const day = 4 + ((i + nth) % 3); // Friday to Sunday
        const { importance, derby } = importanceOf(comp, home, away, r);
        out.push({
          id: `${comp.id}-j${ri + 1}-${slug(home)}-${slug(away)}`,
          week,
          countryCode: comp.countryCode,
          competitionId: comp.id,
          matchday: ri + 1,
          date: addDays(weekStart(week), day),
          kickoff: nth > 0 ? f.kickoffs[(nth + 1) % f.kickoffs.length] : pick(r, f.kickoffs),
          home,
          away,
          city,
          venue: stadium,
          importance,
          risk: riskOf(importance, derby),
          crew: [],
          played: false,
        });
      });
    });
  }
  return out;
}

/** National cup: a round played midweek three weeks ago, the next round midweek in two weeks' time. */
function buildCupFixtures(): DraftFixture[] {
  const out: DraftFixture[] = [];
  for (const comp of competitions.filter((c) => c.tier === "cup")) {
    const f = countryByCode.get(comp.countryCode)!.fact;
    const r = rng(hash(`${comp.id}-draw`));
    const names = f.league.clubs.map((c) => c.name);
    const drawn = [...names].sort(() => r() - 0.5).slice(0, 8);
    const rounds: Array<{ week: number; matchday: number; pairs: Array<[string, string]> }> = [
      { week: -3, matchday: 1, pairs: [[drawn[0], drawn[1]], [drawn[2], drawn[3]], [drawn[4], drawn[5]], [drawn[6], drawn[7]]] },
      { week: 2, matchday: 2, pairs: [[drawn[0], drawn[3]], [drawn[5], drawn[6]]] },
    ];
    for (const round of rounds) {
      round.pairs.forEach(([home, away], i) => {
        const { stadium, city } = homeVenue(home, comp.countryCode);
        const { importance, derby } = importanceOf(comp, home, away, r);
        out.push({
          id: `${comp.id}-t${round.matchday}-${slug(home)}-${slug(away)}`,
          week: round.week,
          countryCode: comp.countryCode,
          competitionId: comp.id,
          matchday: round.matchday,
          date: addDays(weekStart(round.week), 2 + (i % 2)), // Wednesday or Thursday
          kickoff: f.kickoffs[i % f.kickoffs.length],
          home,
          away,
          city,
          venue: stadium,
          importance,
          risk: riskOf(importance, derby),
          crew: [],
          played: false,
        });
      });
    }
  }
  return out;
}

/**
 * CAF interclub preliminary rounds, two legs, drawn between the three federations' qualified clubs, and one
 * AFCON qualifying window. Each tie is staffed from the federation NOT taking part — the neutrality rule.
 */
function buildContinentalFixtures(): DraftFixture[] {
  const out: DraftFixture[] = [];
  // The 2026/27 entrants are real (./real-world.ts); the pairings between them are illustrative. Congo has no
  // entrant this season, so its federation staffs both ties — the neutral list.
  const entrants = (key: "championsLeague" | "confederationCup") =>
    COUNTRY_FACTS.flatMap((f) => f.continental[key].map((club) => [f.code, club] as [string, string]));
  const pairUp = (list: Array<[string, string]>) => {
    const ties: Array<{ a: [string, string]; b: [string, string] }> = [];
    const pool = [...list];
    while (pool.length >= 2) {
      const a = pool.shift()!;
      const i = pool.findIndex(([code]) => code !== a[0]);
      if (i < 0) break;
      ties.push({ a, b: pool.splice(i, 1)[0] });
    }
    return ties;
  };
  const ties = [
    ...pairUp(entrants("championsLeague")).map((t) => ({ comp: "caf-cl", ...t })),
    ...pairUp(entrants("confederationCup")).map((t) => ({ comp: "caf-cc", ...t })),
  ];
  ties.forEach((tie, t) => {
    const comp = competitionById.get(tie.comp)!;
    for (const leg of [1, 2] as const) {
      const [homeCode, home] = leg === 1 ? tie.a : tie.b;
      const [awayCode, away] = leg === 1 ? tie.b : tie.a;
      const week = leg === 1 ? -1 : 1;
      const r = rng(hash(`${tie.comp}-${t}-${leg}`));
      const { stadium, city } = homeVenue(home, homeCode);
      const importance = Math.round(clampN(comp.weight + (leg === 2 ? 6 : 0) + r() * 6, 60, 98));
      const id = `${tie.comp}-p${t + 1}-l${leg}`;
      fixtureNations.set(id, [homeCode, awayCode]);
      out.push({
        id,
        week,
        countryCode: "CAF",
        competitionId: tie.comp,
        matchday: leg,
        date: addDays(weekStart(week), 2), // Wednesday: the leagues play at the weekend
        kickoff: countryByCode.get(homeCode)!.fact.kickoffs.at(-1)!,
        home,
        away,
        city,
        venue: stadium,
        importance,
        risk: riskOf(importance, false),
        crew: [],
        played: false,
      });
    }
  });

  // AFCON qualifiers: the three nations' sides, at each federation's national stadium
  const windows: Array<{ week: number; home: string; away: string; matchday: number }> = [
    { week: -2, home: "CIV", away: "SEN", matchday: 3 },
    { week: 3, home: "COG", away: "CIV", matchday: 4 },
  ];
  for (const w of windows) {
    const comp = competitionById.get("afcon-q")!;
    const host = countryByCode.get(w.home)!;
    const id = `afcon-q-md${w.matchday}-${w.home.toLowerCase()}-${w.away.toLowerCase()}`;
    fixtureNations.set(id, [w.home, w.away]);
    out.push({
      id,
      week: w.week,
      countryCode: "CAF",
      competitionId: comp.id,
      matchday: w.matchday,
      date: addDays(weekStart(w.week), 4), // Friday of a FIFA window
      kickoff: host.fact.kickoffs.at(-1)!,
      home: host.name,
      away: countryByCode.get(w.away)!.name,
      city: stadiumFact(w.home, host.fact.nationalStadium)?.city ?? host.capital,
      venue: host.fact.nationalStadium,
      importance: 95,
      risk: "high",
      crew: [],
      played: false,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Crews
 * ------------------------------------------------------------------ */

function crewShapeFor(fixture: Fixture): CrewRole[] {
  const comp = competitionById.get(fixture.competitionId)!;
  const base: CrewRole[] = ["R", "AR1", "AR2", "FOURTH"];
  if (comp.varEnabled) base.push("VAR", "AVAR");
  if (fixture.importance >= 70 || comp.tier === "continental") base.push("OBS");
  return base;
}

/** Roles that must be filled before a fixture counts as covered. */
export function requiredRoles(fixture: Fixture): CrewRole[] {
  return crewShapeFor(fixture).filter((role) => role !== "OBS");
}

/** Officials a fixture may legally use: its own federation's list at home, never a participating nation abroad. */
export function eligibleNations(fixture: Fixture): (code: string) => boolean {
  if (fixture.countryCode !== "CAF") return (code) => code === fixture.countryCode;
  const involved = fixtureNations.get(fixture.id) ?? [];
  return (code) => !involved.includes(code);
}

/** Declared availability before any appointment, per official and day. */
function declared(officialId: string, date: string): AvailabilityState {
  const roll = rng(hash(officialId + date))();
  if (roll > 0.9) return "unavailable";
  if (roll > 0.85) return "travelling";
  return "available";
}

/** How far ahead the desk has worked: full crews this week and next, a few names in two weeks, nothing after. */
const crewHorizon = (week: number) => (week <= 1 ? "full" : week === 2 ? "partial" : "none");

function buildCrews(list: DraftFixture[]): Fixture[] {
  // The desk works the most important fixtures first, so the big matches get first pick of the panel.
  const ordered = [...list].sort((a, b) => (a.date === b.date ? b.importance - a.importance : a.date.localeCompare(b.date)));
  const appointments = new Map<string, string[]>(); // official → dates

  const free = (id: string, date: string) => {
    if (declared(id, date) === "unavailable") return false;
    const dates = appointments.get(id) ?? [];
    return dates.every((d) => Math.abs(daysBetween(d, date)) >= 3);
  };
  const book = (id: string, date: string) => appointments.set(id, [...(appointments.get(id) ?? []), date]);

  const levelRank: Record<string, number> = { "CAF Elite": 4, "FIFA Listed": 3, "National D1": 2, Regional: 1 };

  return ordered.map(({ week, ...fixture }) => {
    const horizon = crewHorizon(week);
    if (horizon === "none") return { ...fixture, crew: crewShapeFor(fixture).filter((r) => r !== "OBS").map((role) => ({ role, officialId: null, state: "empty" as const })) };

    const r = rng(hash(fixture.id + "crew"));
    const ok = eligibleNations(fixture);
    const big = fixture.importance >= 75;
    const used = new Set<string>();

    const crew: CrewSlot[] = crewShapeFor(fixture).map((role) => {
      if (horizon === "partial" && role !== "R" && r() < 0.6) return { role, officialId: null, state: "empty" };
      const wantsReferee = role === "R" || role === "VAR" || role === "AVAR" || role === "OBS";
      let pool: Array<{ id: string; rank: number; score: number }> = wantsReferee
        ? referees
            .filter((x) => x.status !== "suspended" && ok(x.countryCode) && (role !== "VAR" && role !== "AVAR" ? true : x.varQualified))
            // observers are the senior officials; the referee on a big match is a senior one too
            .filter((x) => (role === "OBS" ? levelRank[x.level] >= 3 : true))
            .map((x) => ({ id: x.id, rank: levelRank[x.level], score: x.arps }))
        : assistants.filter((x) => ok(x.countryCode)).map((x) => ({ id: x.id, rank: levelRank[x.level], score: x.rating }));
      pool = pool.filter((x) => !used.has(x.id) && free(x.id, fixture.date));
      if (big) pool.sort((a, b) => b.rank - a.rank || b.score - a.score);
      else pool.sort(() => r() - 0.5);
      // leave a little real work on the desk this week: a slot nobody has taken yet
      const hole = !fixture.played && role !== "OBS" && r() < (role === "R" ? 0.04 : 0.07);
      const chosen = hole ? undefined : (big ? pool.slice(0, 3) : pool)[Math.floor(r() * Math.min(3, pool.length))];
      if (!chosen) return { role, officialId: null, state: "empty" };
      used.add(chosen.id);
      book(chosen.id, fixture.date);
      const roll = r();
      const state: SlotState = fixture.played ? "confirmed" : roll > 0.86 ? "pending" : roll > 0.83 ? "declined" : "confirmed";
      return { role, officialId: chosen.id, state };
    });
    // an observer is either appointed or the fixture has no observer slot — a blank observer is not a real state
    return { ...fixture, crew: crew.filter((s) => s.role !== "OBS" || s.officialId) };
  });
}

// a fixture is played once its date is behind "now"
const drafts = [...buildLeagueFixtures(), ...buildCupFixtures(), ...buildContinentalFixtures()].map((f) => ({ ...f, played: f.date < DEMO_NOW }));

export const fixtures: Fixture[] = buildCrews(drafts).sort((a, b) =>
  a.date === b.date ? b.importance - a.importance : a.date.localeCompare(b.date),
);

export const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

/** The Mondays of the weeks the demo calendar spans. */
export const weekStarts = Array.from({ length: PLAYED_ROUNDS + SCHEDULED_ROUNDS }, (_, i) => weekStart(i - PLAYED_ROUNDS));

export function weekDates(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Declared availability, as the federation's desk sees it. */
export function availabilityFor(officialId: string, date: string): AvailabilityState {
  const assignedHere = fixtures.some((f) => f.date === date && f.crew.some((s) => s.officialId === officialId && s.state !== "empty"));
  if (assignedHere) return "assigned";
  const own = declared(officialId, date);
  if (own !== "available") return own;
  // the day after a match: resting
  const dayBefore = addDays(date, -1);
  if (fixtures.some((f) => f.date === dayBefore && f.crew.some((s) => s.officialId === officialId && s.state !== "empty"))) return "resting";
  return "available";
}

/** Days since this official's last appointment before `date`. */
export function restDays(officialId: string, date: string) {
  const past = fixtures
    .filter((f) => f.date < date && f.crew.some((s) => s.officialId === officialId))
    .map((f) => f.date)
    .sort();
  const last = past.at(-1);
  return last ? daysBetween(last, date) : 14;
}

/* ------------------------------------------------------------------ *
 * Played matches — one per played fixture, with the refereeing analytics
 * ------------------------------------------------------------------ */

export type DecisionType = "Penalty" | "Red Card" | "Yellow Card" | "Offside" | "Handball" | "Foul";

export interface MatchDecision {
  id: string;
  minute: number;
  type: DecisionType;
  description: { en: string; fr: string };
  initialCall: "given" | "not-given";
  varReview: boolean;
  finalCall: "confirmed" | "overturned";
  confidence: number;
  pressureIndex: number;
  /** Referee's distance from the incident, in metres. */
  distance: number;
  /** Shirt numbers only — players are never named. */
  players: string[];
}

export interface MatchRecord {
  id: string;
  fixtureId: string;
  home: string;
  away: string;
  competitionId: string;
  countryCode: string;
  date: string;
  kickoff: string;
  venue: string;
  attendance: number | null;
  weather: { condition: string; temperatureC: number; humidity: number };
  score: string;
  refereeId: string;
  arpsForMatch: number;
  rmcs: number;
  pressureAvg: number;
  physical: { distanceKm: number; sprints: number; topSpeed: number; avgDistanceToBall: number; diagonalAdherence: number };
  decisions: MatchDecision[];
  pressureTimeline: { minute: number; pressure: number }[];
}

const DECISION_BANK: Record<DecisionType, Array<{ en: string; fr: string }>> = {
  "Yellow Card": [
    { en: "Reckless tackle from behind in the middle third.", fr: "Tacle imprudent par derrière dans l'entrejeu." },
    { en: "Tactical foul stopping a promising counter-attack.", fr: "Faute tactique qui stoppe un contre prometteur." },
    { en: "Dissent towards the assistant after an offside flag.", fr: "Contestation envers l'assistant après un drapeau de hors-jeu." },
    { en: "Delaying the restart at a free kick.", fr: "Retard volontaire à la reprise sur un coup franc." },
    { en: "Simulation inside the penalty area.", fr: "Simulation dans la surface de réparation." },
  ],
  "Red Card": [
    { en: "Denial of an obvious goal-scoring opportunity on the edge of the area.", fr: "Annihilation d'une occasion de but manifeste à l'entrée de la surface." },
    { en: "Serious foul play: studs-up challenge at full speed.", fr: "Faute grossière : tacle semelle en avant à pleine vitesse." },
    { en: "Second caution for a late challenge.", fr: "Second avertissement pour une intervention en retard." },
  ],
  Penalty: [
    { en: "Trip on the attacker cutting inside from the left.", fr: "Croc-en-jambe sur l'attaquant qui repique depuis la gauche." },
    { en: "Holding at a corner kick, both arms round the attacker.", fr: "Ceinturage sur un corner, les deux bras autour de l'attaquant." },
    { en: "Late challenge on a one-on-one with the goalkeeper.", fr: "Intervention en retard sur un face-à-face avec le gardien." },
  ],
  Handball: [
    { en: "Ball strikes an arm held away from the body inside the area.", fr: "Ballon sur un bras décollé du corps dans la surface." },
    { en: "Arm above the shoulder blocks a cross.", fr: "Bras au-dessus de l'épaule qui contre un centre." },
  ],
  Offside: [
    { en: "Tight offside on a through ball behind the defensive line.", fr: "Hors-jeu serré sur une ouverture dans le dos de la défense." },
    { en: "Offside on the second phase of a set piece.", fr: "Hors-jeu sur la deuxième phase d'un coup de pied arrêté." },
    { en: "Attacker interfering with the goalkeeper's line of vision.", fr: "Attaquant qui gêne la vision du gardien." },
  ],
  Foul: [
    { en: "Push in the back contesting a header.", fr: "Poussée dans le dos sur un duel aérien." },
    { en: "Off-the-ball holding as a corner is taken.", fr: "Accrochage loin du ballon pendant l'exécution d'un corner." },
    { en: "Late challenge near the technical area.", fr: "Intervention en retard près de la zone technique." },
  ],
};

const WEATHER = [
  { condition: "Sunny", fr: "Ensoleillé" },
  { condition: "Partly cloudy", fr: "Nuageux" },
  { condition: "Humid", fr: "Humide" },
  { condition: "Light rain", fr: "Pluie légère" },
  { condition: "Thunderstorm", fr: "Orage" },
] as const;

function poissonGoals(r: () => number, mean: number) {
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > l && k < 8);
  return k - 1;
}

function timeline(r: () => number, peak: number) {
  return [0, 10, 20, 30, 40, 45, 55, 60, 70, 80, 90].map((minute, i) => ({
    minute,
    pressure: Math.round(clampN(20 + (peak - 20) * (i / 10) + bell(r) * 8, 5, 99)),
  }));
}

function buildMatch(f: Fixture): MatchRecord | null {
  const refereeSlot = f.crew.find((s) => s.role === "R" && s.officialId);
  const ref = refereeSlot ? refereeById.get(refereeSlot.officialId!) : undefined;
  if (!ref) return null;
  const comp = competitionById.get(f.competitionId)!;
  const r = rng(hash(f.id + "match"));
  const host = f.countryCode === "CAF" ? (fixtureNations.get(f.id)?.[0] ?? "SEN") : f.countryCode;

  const homeGoals = poissonGoals(r, 1.25);
  const awayGoals = poissonGoals(r, 0.85);
  const capacity = stadiumFact(host, f.venue)?.capacity ?? null;
  const fill = comp.tier === "continental" ? 0.55 + r() * 0.4 : f.risk === "high" ? 0.45 + r() * 0.4 : 0.08 + r() * 0.3;
  const weather = WEATHER[Math.floor(r() * (r() > 0.7 ? WEATHER.length : 3))];

  // quality of the night: the referee's level, plus the match's own story
  const form = bell(r) * 3;
  const arpsForMatch = round1(clampN(ref.arps + form, 60, 98));
  const decisionCount = 3 + Math.floor(r() * 4) + (f.risk === "high" ? 1 : 0);
  const types: DecisionType[] = ["Yellow Card", "Yellow Card", "Foul", "Offside", "Penalty", "Handball", "Red Card"];
  const decisions: MatchDecision[] = Array.from({ length: decisionCount }, (_, i) => {
    const type = types[Math.floor(r() * (i === 0 ? 4 : types.length))];
    const reviewable = comp.varEnabled && (type === "Penalty" || type === "Red Card" || type === "Offside" || type === "Handball");
    const varReview = reviewable && r() > 0.35;
    const overturned = varReview ? r() < 0.25 : false;
    const minute = clampN(Math.round(((i + 1) / (decisionCount + 1)) * 90 + bell(r) * 6), 2, 90);
    const near = type === "Offside" ? 22 + r() * 14 : 6 + r() * 16;
    const shirt = () => `#${1 + Math.floor(r() * 23)}`;
    return {
      id: `d${i + 1}`,
      minute,
      type,
      description: pick(r, DECISION_BANK[type]),
      initialCall: overturned ? (r() > 0.5 ? "given" : "not-given") : type === "Offside" || type === "Penalty" ? (r() > 0.2 ? "given" : "not-given") : "given",
      varReview,
      finalCall: overturned ? "overturned" : "confirmed",
      confidence: Math.round(clampN(arpsForMatch + bell(r) * 6, 70, 99)),
      pressureIndex: Math.round(clampN(30 + (minute / 90) * 45 + (f.risk === "high" ? 12 : 0) + bell(r) * 10, 10, 99)),
      distance: Math.round(near),
      players: type === "Foul" || type === "Penalty" ? [shirt(), shirt()] : [shirt()],
    };
  });
  const peak = clampN((f.risk === "high" ? 88 : f.risk === "medium" ? 74 : 60) + bell(r) * 6, 40, 99);

  return {
    id: `m-${f.id}`,
    fixtureId: f.id,
    home: f.home,
    away: f.away,
    competitionId: f.competitionId,
    countryCode: f.countryCode,
    date: f.date,
    kickoff: f.kickoff,
    venue: f.venue,
    attendance: capacity ? Math.round((capacity * fill) / 50) * 50 : null,
    weather: { condition: weather.condition, temperatureC: Math.round(26 + bell(r) * 4), humidity: Math.round(clampN(70 + bell(r) * 15, 40, 98)) },
    score: `${homeGoals} - ${awayGoals}`,
    refereeId: ref.id,
    arpsForMatch,
    rmcs: round1(clampN(ref.rmcsAvg + form + bell(r), 55, 98)),
    pressureAvg: Math.round(peak * 0.78),
    physical: {
      distanceKm: round1(clampN(9.2 + (ref.fitness - 70) * 0.09 + bell(r) * 0.6, 8, 12.8)),
      sprints: Math.round(clampN(22 + (ref.fitness - 70) * 0.6 + bell(r) * 5, 12, 48)),
      topSpeed: round1(clampN(21.5 + (ref.fitness - 70) * 0.12 + bell(r), 19, 27)),
      avgDistanceToBall: round1(clampN(19.5 - (arpsForMatch - 75) * 0.18 + bell(r) * 1.5, 12, 26)),
      diagonalAdherence: Math.round(clampN(70 + (arpsForMatch - 75) * 0.9 + bell(r) * 4, 55, 95)),
    },
    decisions: decisions.sort((a, b) => a.minute - b.minute).map((d, i) => ({ ...d, id: `d${i + 1}` })),
    pressureTimeline: timeline(r, peak),
  };
}

export const matches: MatchRecord[] = fixtures.filter((f) => f.played).flatMap((f) => buildMatch(f) ?? []);
export const matchById = new Map(matches.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ *
 * Observer reports and dossiers
 * ------------------------------------------------------------------ */

export interface Assessment {
  id: string;
  matchId: string;
  refereeId: string;
  observerId: string;
  state: "filed" | "draft" | "overdue";
  filedHoursAfter: number | null;
  overall: number;
  marks: { positioning: number; decisions: number; gameManagement: number; teamwork: number; discipline: number; fitness: number };
  notes: { en: string; fr: string };
  clips: { minute: number; label: { en: string; fr: string } }[];
}

const WEIGHTS = { positioning: 20, decisions: 25, gameManagement: 20, discipline: 15, teamwork: 10, fitness: 10 } as const;

const STRENGTH: Record<keyof typeof WEIGHTS, { en: string; fr: string }> = {
  positioning: { en: "Kept a disciplined diagonal and was rarely screened from play.", fr: "Diagonale disciplinée, rarement masqué par le jeu." },
  decisions: { en: "Read the key incidents correctly and sold them with conviction.", fr: "Lecture juste des faits de match, décisions assumées avec autorité." },
  gameManagement: { en: "Let the game breathe and judged the advantage well.", fr: "A laissé respirer le match et bien géré l'avantage." },
  discipline: { en: "Cautions were consistent from the first minute to the last.", fr: "Avertissements cohérents de la première à la dernière minute." },
  teamwork: { en: "Clear communication with the assistants on every tight call.", fr: "Communication claire avec les assistants sur chaque situation serrée." },
  fitness: { en: "Strong physical output, still close to play in the final quarter.", fr: "Bonne présence physique, toujours proche du jeu dans le dernier quart d'heure." },
};
const WORK_ON: Record<keyof typeof WEIGHTS, { en: string; fr: string }> = {
  positioning: { en: "Too often level with play on counter-attacks; needs to anticipate the transition.", fr: "Trop souvent à hauteur du jeu sur les contres ; doit anticiper la transition." },
  decisions: { en: "One key call was outside the expected range and needs reviewing on video.", fr: "Une décision clé hors de la marge attendue, à revoir en vidéo." },
  gameManagement: { en: "Lost the temperature of the match for ten minutes after the break.", fr: "A perdu la température du match une dizaine de minutes après la pause." },
  discipline: { en: "The threshold for a caution moved during the second half.", fr: "Le seuil d'avertissement a varié en seconde période." },
  teamwork: { en: "Body language towards the benches could be calmer.", fr: "L'attitude envers les bancs pourrait être plus apaisée." },
  fitness: { en: "Distance to play grew in the last fifteen minutes.", fr: "La distance au jeu s'allonge dans le dernier quart d'heure." },
};

function buildAssessments(): Assessment[] {
  const out: Assessment[] = [];
  for (const m of matches) {
    const f = fixtureById.get(m.fixtureId)!;
    const obs = f.crew.find((s) => s.role === "OBS" && s.officialId);
    if (!obs) continue;
    const r = rng(hash(m.id + "report"));
    const ageDays = daysBetween(m.date, DEMO_NOW);
    // filed within a few days; the last weekend's reports are still being written, one is late
    const state: Assessment["state"] = ageDays <= 2 ? "draft" : ageDays <= 6 && r() < 0.25 ? "overdue" : "filed";
    const ref = refereeById.get(m.refereeId)!;
    const base = clampN(ref.arps / 10 + bell(r) * 0.4, 6, 9.6);
    const keys = Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>;
    const marks = Object.fromEntries(keys.map((k) => [k, round1(clampN(base + bell(r) * 0.6 + (k === "fitness" ? (ref.fitness - 82) / 25 : 0), 5, 10))])) as Assessment["marks"];
    const overall = round1(keys.reduce((s, k) => s + marks[k] * WEIGHTS[k], 0) / 100);
    const best = [...keys].sort((a, b) => marks[b] - marks[a])[0];
    const worst = [...keys].sort((a, b) => marks[a] - marks[b])[0];
    const key = m.decisions.find((d) => d.type === "Penalty" || d.type === "Red Card") ?? m.decisions[0];
    if (state === "overdue") {
      out.push({ id: `as-${m.id}`, matchId: m.id, refereeId: m.refereeId, observerId: obs.officialId!, state, filedHoursAfter: null, overall: 0, marks: { positioning: 0, decisions: 0, gameManagement: 0, teamwork: 0, discipline: 0, fitness: 0 }, notes: { en: "", fr: "" }, clips: [] });
      continue;
    }
    out.push({
      id: `as-${m.id}`,
      matchId: m.id,
      refereeId: m.refereeId,
      observerId: obs.officialId!,
      state,
      filedHoursAfter: state === "filed" ? 10 + Math.floor(r() * 50) : null,
      overall,
      marks,
      notes: {
        en: `${STRENGTH[best].en} ${WORK_ON[worst].en}${key ? ` The ${key.type.toLowerCase()} at ${key.minute}' was ${key.finalCall === "overturned" ? "corrected by the VAR" : "the right outcome"}.` : ""}`,
        fr: `${STRENGTH[best].fr} ${WORK_ON[worst].fr}${key ? ` La décision de la ${key.minute}e (${DECISION_FR[key.type]}) ${key.finalCall === "overturned" ? "a été corrigée par la VAR" : "est la bonne"}.` : ""}`,
      },
      clips: m.decisions
        .filter((d) => d.type !== "Foul")
        .slice(0, 3)
        .map((d) => ({ minute: d.minute, label: { en: `${d.type} — ${d.varReview ? "VAR review" : "angle of view"}`, fr: `${DECISION_FR[d.type]} — ${d.varReview ? "revue VAR" : "angle de vue"}` } })),
    });
  }
  return out;
}

const DECISION_FR: Record<DecisionType, string> = {
  Penalty: "penalty",
  "Red Card": "carton rouge",
  "Yellow Card": "carton jaune",
  Offside: "hors-jeu",
  Handball: "main",
  Foul: "faute",
};

export const assessments: Assessment[] = buildAssessments();
export const assessmentByMatch = new Map(assessments.map((a) => [a.matchId, a]));

export interface Dossier {
  id: string;
  matchId: string;
  generated: string;
  pages: number;
  recipients: string[];
}

/** A match dossier goes out for every filed report on a high-risk or continental match. */
export const dossiers: Dossier[] = assessments
  .filter((a) => a.state === "filed")
  .map((a) => ({ a, m: matchById.get(a.matchId)!, f: fixtureById.get(matchById.get(a.matchId)!.fixtureId)! }))
  .filter(({ f }) => f.risk === "high" || f.countryCode === "CAF")
  .map(({ a, m, f }, i) => {
    const ref = refereeById.get(a.refereeId)!;
    const fed = countryByCode.get(ref.countryCode)!.federation;
    return {
      id: `dos-${i + 1}`,
      matchId: m.id,
      generated: addDays(m.date, 2 + (hash(m.id) % 3)),
      pages: 10 + m.decisions.length + (hash(a.id) % 4),
      recipients: f.countryCode === "CAF" ? ["CAF Referees Department", fed] : [fed, ref.name],
    };
  });

/* ------------------------------------------------------------------ *
 * Licences, fitness, courses
 * ------------------------------------------------------------------ */

export interface Licence {
  id: string;
  refereeId: string;
  kind: "FIFA Badge" | "CAF Elite Panel" | "National D1" | "VAR Certification" | "Fitness Clearance";
  issued: string;
  expires: string;
}

function licencesFor(referee: Referee): Licence[] {
  const r = rng(hash(referee.id + "lic"));
  const kinds: Licence["kind"][] = ["National D1"];
  if (referee.level === "FIFA Listed" || referee.level === "CAF Elite") kinds.push("FIFA Badge");
  if (referee.level === "CAF Elite") kinds.push("CAF Elite Panel");
  if (referee.varQualified) kinds.push("VAR Certification");
  kinds.push("Fitness Clearance");
  return kinds.map((kind, i) => {
    // a year from issue; spread so a few are close to running out, and one or two already have
    const expires = addDays(DEMO_TODAY, Math.round(r() * 330) - 25);
    return { id: `${referee.id}-lic-${i}`, refereeId: referee.id, kind, issued: addDays(expires, -365), expires };
  });
}

export const licences: Licence[] = referees.flatMap(licencesFor);

export interface FitnessTest {
  refereeId: string;
  date: string;
  test1: { result: "passed" | "failed"; bestSprint: number };
  test2: { result: "passed" | "failed"; laps: number };
  retestDate: string | null;
}

/** The FIFA fitness test: 6 × 40 m sprints, then the interval test (40 laps of 75 m run / 25 m walk to pass). */
export const fitnessTests: FitnessTest[] = referees.map((referee) => {
  const r = rng(hash(referee.id + "fit"));
  const test1Pass = referee.fitness >= 74 || r() > 0.5;
  const test2Pass = referee.fitness >= 78 || r() > 0.55;
  return {
    refereeId: referee.id,
    // the federations test their panels together at the pre-season camp
    date: addDays(DEMO_TODAY, -(PLAYED_ROUNDS * 7 + 14 + (hash(referee.countryCode) % 5))),
    test1: { result: test1Pass ? "passed" : "failed", bestSprint: Math.round((5.6 + (100 - referee.fitness) * 0.014) * 100) / 100 },
    test2: { result: test2Pass ? "passed" : "failed", laps: test2Pass ? 40 : 28 + Math.round(r() * 10) },
    retestDate: test1Pass && test2Pass ? null : addDays(DEMO_TODAY, 10 + Math.round(r() * 20)),
  };
});

export interface Course {
  id: string;
  name: { en: string; fr: string };
  provider: string;
  hours: number;
  refereeIds: string[];
  state: "enrolled" | "completed" | "not-started";
}

const byCountry = (code: string) => referees.filter((x) => x.countryCode === code);

export const courses: Course[] = [
  { id: "c-lotg", name: { en: "Laws of the Game 2026/27 — changes and clarifications", fr: "Lois du Jeu 2026/27 — modifications et précisions" }, provider: "FIFA", hours: 8, refereeIds: referees.map((x) => x.id), state: "completed" },
  ...COUNTRY_FACTS.map<Course>((f) => ({
    id: `c-preseason-${f.code.toLowerCase()}`,
    name: { en: `Pre-season seminar — ${f.federation.code} referees' committee`, fr: `Séminaire de pré-saison — ${f.refereesCommittee}` },
    provider: f.federation.code,
    hours: 16,
    refereeIds: byCountry(f.code).map((x) => x.id),
    state: "completed",
  })),
  { id: "c-var", name: { en: "VAR — initial certification, practical module", fr: "VAR — certification initiale, module pratique" }, provider: "CAF Referees Academy", hours: 32, refereeIds: referees.filter((x) => x.level === "FIFA Listed" && !x.varQualified).map((x) => x.id), state: "enrolled" },
  { id: "c-elite", name: { en: "CAF elite referees' course", fr: "Stage des arbitres élites de la CAF" }, provider: "CAF Referees Academy", hours: 24, refereeIds: referees.filter((x) => x.level === "CAF Elite").map((x) => x.id), state: "enrolled" },
  { id: "c-talent", name: { en: "Young talent programme — positioning and reading the game", fr: "Programme jeunes talents — placement et lecture du jeu" }, provider: "CAF Referees Academy", hours: 20, refereeIds: referees.filter((x) => x.level === "Regional").map((x) => x.id), state: "not-started" },
];

/** Continental average ARPS for the six months ending in the demo month, oldest first. */
export const arpsTrend = (() => {
  const mean = referees.reduce((s, x) => s + x.arps, 0) / referees.length;
  return [-2.4, -1.9, -1.3, -0.9, -0.4, 0].map((delta, i) => ({ month: i, score: round1(mean + delta) }));
})();
