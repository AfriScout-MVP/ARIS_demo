// Everything derived from the loaded data: sub-indices, rankings, federation and zone
// roll-ups, workload, headline figures. Pure functions of the store; nothing here is stored.

import { daysBetween } from "./dates";
import { today } from "./clock";
import { countries, competitions, countryByCode, zones } from "./geography";
import { assistants, referees } from "./officials";
import { fixtures, openSlots } from "./fixtures";
import { matches } from "./matches";
import { criteria as gridCriteria } from "./assessments";
import type { Country, Criterion, CriterionAverage, DecisionShare, Localized, RefereeLevel, SyncHealth, TrendPoint, Zone } from "./types";

/** The monthly ARPS series from `snapshot.analytics`, oldest first. */
export const arpsTrend: TrendPoint[] = [];
/** The share of each decision outcome from `snapshot.analytics`, in percent. */
export const decisionsBreakdown: DecisionShare[] = [];

const round1 = (n: number) => Math.round(n * 10) / 10;
export const mean = (values: number[]) => (values.length ? round1(values.reduce((s, v) => s + v, 0) / values.length) : 0);

/** Each referee's mean mark per grid criterion over their filed reports, from `snapshot.analytics`. */
export const criterionAverages: CriterionAverage[] = [];
export const criterionAveragesByReferee = new Map<string, CriterionAverage>();

/** Fewer filed reports than this and the radar says "not enough assessments" instead of drawing a shape. */
export const RADAR_MIN_REPORTS = 3;
/** A radar needs at least three axes to be a shape; with fewer, the values are listed instead. */
export const RADAR_MIN_AXES = 3;

export interface RadarAxis {
  key: string;
  label: Localized;
  /** Mean mark on the grid's 0–10 scale, one decimal. */
  value: number;
  /** Reports that marked this criterion. */
  n: number;
}

export interface RefereeRadar {
  /** Filed reports on the referee. */
  reports: number;
  /** True when there are enough reports to show a profile at all. */
  enough: boolean;
  /** The grid's criteria the referee has actually been marked on, in grid order; criteria with no mark are left out. */
  axes: RadarAxis[];
}

/**
 * The referee's profile on the evaluation grid: one axis per criterion, the mean of the marks observers gave in
 * filed reports. Nothing is estimated — a criterion nobody marked has no axis, and too few reports means no profile.
 */
export function deriveRadar(average: CriterionAverage | undefined, grid: Criterion[], minReports = RADAR_MIN_REPORTS): RefereeRadar {
  const reports = average?.reports ?? 0;
  const axes = grid
    .filter((c) => (average?.marks[c.key]?.n ?? 0) > 0)
    .map((c) => ({ key: c.key, label: c.label, value: round1(average!.marks[c.key].avg), n: average!.marks[c.key].n }));
  return { reports, enough: reports >= minReports && axes.length > 0, axes };
}

export const radarFor = (refereeId: string) => deriveRadar(criterionAveragesByReferee.get(refereeId), gridCriteria);

/** Two referees on the axes both have data for — a comparison never pits a mark against a blank. */
export function sharedAxes(a: RefereeRadar, b: RefereeRadar) {
  if (!a.enough || !b.enough) return [];
  const other = new Map(b.axes.map((x) => [x.key, x]));
  return a.axes.filter((x) => other.has(x.key)).map((x) => ({ key: x.key, label: x.label, a: x.value, b: other.get(x.key)!.value }));
}

/** Change in the average ARPS between the last two months of the series; null when there is no history to compare. */
export function arpsDelta(): number | null {
  if (arpsTrend.length < 2) return null;
  return round1(arpsTrend[arpsTrend.length - 1].score - arpsTrend[arpsTrend.length - 2].score);
}

export interface RankingRow {
  rank: number;
  refereeId: string;
  name: string;
  countryCode: string;
  zone: Zone | null;
  level: RefereeLevel;
  arps: number;
  matches: number;
  delta: number;
}

export function rankingsFor(codes: string[]): RankingRow[] {
  const set = new Set(codes);
  return referees
    .filter((r) => set.has(r.countryCode))
    .slice()
    .sort((a, b) => b.arps - a.arps)
    .map((r, i) => ({
      rank: i + 1,
      refereeId: r.id,
      name: r.name,
      countryCode: r.countryCode,
      zone: countryByCode.get(r.countryCode)?.zone ?? null,
      level: r.level,
      arps: r.arps,
      matches: r.matches,
      delta: r.trend,
    }));
}

export interface FederationRow {
  code: string;
  countryCode: string;
  zone: Zone;
  refereeCount: number;
  eliteCount: number;
  avgArps: number;
  competitions: number;
  fixtures: number;
  openSlots: number;
  syncHealth: SyncHealth;
  syncSource: Country["syncSource"];
  lastSyncHours: number | null;
}

export function federationRows(): FederationRow[] {
  return countries.map((country) => {
    const corps = referees.filter((r) => r.countryCode === country.code);
    const countryFixtures = fixtures.filter((f) => f.countryCode === country.code);
    return {
      code: country.federation,
      countryCode: country.code,
      zone: country.zone,
      refereeCount: corps.length,
      eliteCount: corps.filter((r) => r.level === "CAF Elite").length,
      avgArps: mean(corps.map((r) => r.arps)),
      competitions: competitions.filter((c) => c.countryCode === country.code).length,
      fixtures: countryFixtures.length,
      openSlots: countryFixtures.reduce((s, f) => s + openSlots(f), 0),
      syncHealth: country.syncHealth,
      syncSource: country.syncSource,
      lastSyncHours: country.lastSyncHours,
    };
  });
}

export interface ZoneRow {
  zone: Zone;
  referees: number;
  avgArps: number;
  countries: number;
}

/** One row per zone that has at least one country in the loaded data. */
export function zoneDistribution(): ZoneRow[] {
  return zones
    .map((zone) => {
      const zoneCountries = countries.filter((c) => c.zone === zone);
      const codes = new Set(zoneCountries.map((c) => c.code));
      const corps = referees.filter((r) => codes.has(r.countryCode));
      return { zone, referees: corps.length, avgArps: mean(corps.map((r) => r.arps)), countries: zoneCountries.length };
    })
    .filter((row) => row.countries > 0);
}

export interface WorkloadRow {
  officialId: string;
  name: string;
  countryCode: string;
  kind: "referee" | "assistant";
  appointments: number;
  asReferee: number;
  lastDate: string | null;
  /** Days between now and the next appointment; null when none is booked. */
  nextInDays: number | null;
}

export const WORKLOAD_HEAVY = 4;

/**
 * Appointments per official across the loaded window. Over-use and idleness are
 * both problems: one burns an official out, the other is how a federation quietly
 * loses people.
 */
export function workloadFor(codes: string[]): WorkloadRow[] {
  const set = new Set(codes);
  const rows = new Map<string, WorkloadRow>();

  const seed = (id: string, name: string, countryCode: string, kind: WorkloadRow["kind"]) => {
    if (!set.has(countryCode)) return;
    rows.set(id, { officialId: id, name, countryCode, kind, appointments: 0, asReferee: 0, lastDate: null, nextInDays: null });
  };
  referees.forEach((r) => seed(r.id, r.name, r.countryCode, "referee"));
  assistants.forEach((a) => seed(a.id, a.name, a.countryCode, "assistant"));

  const now = today();
  fixtures.forEach((fixture) => {
    fixture.crew.forEach((slot) => {
      if (!slot.officialId || slot.state === "empty") return;
      const row = rows.get(slot.officialId);
      if (!row) return;
      row.appointments += 1;
      if (slot.role === "R") row.asReferee += 1;
      if (fixture.played && (!row.lastDate || fixture.date > row.lastDate)) row.lastDate = fixture.date;
      if (!fixture.played) {
        const days = daysBetween(now, fixture.date);
        if (days >= 0 && (row.nextInDays === null || days < row.nextInDays)) row.nextInDays = days;
      }
    });
  });

  return [...rows.values()].sort((a, b) => b.appointments - a.appointments);
}

export interface Kpis {
  refereesTracked: number;
  assistantsTracked: number;
  federations: number;
  competitions: number;
  avgArps: number;
  /** Decisions the loaded matches carry. */
  decisionsReviewed: number;
  /** Mean VAR accuracy of the VAR-qualified referees; null when there are none. */
  varAccuracy: number | null;
}

/** Headline numbers, computed from what is loaded. */
export function kpis(): Kpis {
  const varReferees = referees.filter((r) => r.varQualified);
  return {
    refereesTracked: referees.length,
    assistantsTracked: assistants.length,
    federations: countries.length,
    competitions: competitions.length,
    avgArps: mean(referees.map((r) => r.arps)),
    decisionsReviewed: matches.reduce((n, m) => n + m.decisions.length, 0),
    varAccuracy: varReferees.length ? mean(varReferees.map((r) => r.varAccuracy)) : null,
  };
}
