import type { TKey } from "@/locales";
import type { CompetitionBody, CompetitionPatch, CompetitionRow, CompetitionTier } from "@/lib/api/competitions";

/* The competition form as typed, and the Worker's rules checked before it is sent. Pure: tested on its own. */

export const CONTINENTAL = "CAF";

export interface CompetitionValues {
  name: string;
  shortName: string;
  tier: CompetitionTier;
  gender: "M" | "W";
  season: string;
  matchdays: string;
  currentMatchday: string;
  varEnabled: boolean;
  weight: string;
  isActive: boolean;
}

export type CompetitionField = "name" | "shortName" | "tier" | "season" | "matchdays" | "currentMatchday" | "weight";
export type CompetitionErrors = Partial<Record<CompetitionField, TKey>>;

/** African club seasons mostly run August to May: from July on, the season is this year's. */
export function seasonOf(today: string): string {
  const y = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

export const isSeason = (s: string) => /^\d{4}\/\d{4}$/.test(s) && Number(s.slice(5)) === Number(s.slice(0, 4)) + 1;

export function nextSeason(s: string): string {
  const y = Number(s.slice(0, 4)) + 1;
  return `${y}/${y + 1}`;
}

/** CAF runs only continental competitions, and only CAF does. */
export const tiersFor = (countryCode: string): CompetitionTier[] => (countryCode === CONTINENTAL ? ["continental"] : ["d1", "d2", "cup"]);

export function emptyCompetition(countryCode: string, today: string): CompetitionValues {
  return {
    name: "",
    shortName: "",
    tier: tiersFor(countryCode)[0],
    gender: "M",
    season: seasonOf(today),
    matchdays: "30",
    currentMatchday: "0",
    varEnabled: false,
    weight: "1",
    isActive: true,
  };
}

export const fromCompetition = (c: CompetitionRow): CompetitionValues => ({
  name: c.name,
  shortName: c.shortName ?? "",
  tier: c.tier,
  gender: c.gender,
  season: c.season,
  matchdays: String(c.matchdays),
  currentMatchday: String(c.currentMatchday),
  varEnabled: c.varEnabled,
  weight: String(c.weight),
  isActive: c.isActive,
});

const int = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : NaN);
const weightOf = (s: string) => {
  const t = s.trim().replace(",", ".");
  return /^\d{1,2}(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
};

export function validateCompetition(v: CompetitionValues, countryCode: string): CompetitionErrors {
  const e: CompetitionErrors = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 120) e.name = "competitions.errors.name";
  if (v.shortName.trim().length > 30) e.shortName = "competitions.errors.shortName";
  if (!tiersFor(countryCode).includes(v.tier)) e.tier = "competitions.errors.tier";
  if (!isSeason(v.season)) e.season = "competitions.errors.season";
  const md = int(v.matchdays);
  if (!(md >= 1 && md <= 100)) e.matchdays = "competitions.errors.matchdays";
  const cur = int(v.currentMatchday);
  if (!(cur >= 0 && cur <= 100)) e.currentMatchday = "competitions.errors.currentMatchday";
  else if (md >= 1 && cur > md) e.currentMatchday = "competitions.errors.beyondLast";
  const w = weightOf(v.weight);
  if (!(w >= 0 && w <= 10)) e.weight = "competitions.errors.weight";
  return e;
}

export function toCompetitionBody(v: CompetitionValues, countryCode: string): CompetitionBody {
  return {
    countryCode,
    name: v.name.trim(),
    shortName: v.shortName.trim() || null,
    tier: v.tier,
    gender: v.gender,
    season: v.season,
    matchdays: int(v.matchdays),
    currentMatchday: int(v.currentMatchday),
    varEnabled: v.varEnabled,
    weight: weightOf(v.weight),
    isActive: v.isActive,
  };
}

/** Only the changed fields; season and gender are fixed once a competition exists. */
export function toCompetitionPatch(v: CompetitionValues, before: CompetitionRow): CompetitionPatch {
  const next = toCompetitionBody(v, before.countryCode);
  const p: CompetitionPatch = {};
  if (next.name !== before.name) p.name = next.name;
  if ((next.shortName ?? null) !== (before.shortName ?? null)) p.shortName = next.shortName;
  if (next.tier !== before.tier) p.tier = next.tier;
  if (next.matchdays !== before.matchdays) p.matchdays = next.matchdays;
  if (next.currentMatchday !== before.currentMatchday) p.currentMatchday = next.currentMatchday;
  if (next.varEnabled !== before.varEnabled) p.varEnabled = next.varEnabled;
  if (next.weight !== before.weight) p.weight = next.weight;
  if (next.isActive !== before.isActive) p.isActive = next.isActive;
  return p;
}

/** The same competition for the following season, starting from matchday 0. */
export function rolloverBody(c: CompetitionRow): CompetitionBody {
  return {
    countryCode: c.countryCode,
    name: c.name,
    shortName: c.shortName,
    tier: c.tier,
    gender: c.gender,
    season: nextSeason(c.season),
    matchdays: c.matchdays,
    currentMatchday: 0,
    varEnabled: c.varEnabled,
    weight: c.weight,
    isActive: true,
  };
}

/** A competition already carried into the next season is not carried twice. */
export const hasNextSeason = (c: CompetitionRow, all: CompetitionRow[]) =>
  all.some((o) => o.id !== c.id && o.countryCode === c.countryCode && o.name === c.name && o.gender === c.gender && o.season === nextSeason(c.season));

export const progress = (c: Pick<CompetitionRow, "matchdays" | "currentMatchday">) =>
  c.matchdays > 0 ? Math.min(100, Math.round((c.currentMatchday / c.matchdays) * 100)) : 0;
