import type { TKey } from "@/locales";
import type { HeatPoint, MatchRecord } from "@/lib/store/types";

/*
 * Recording what the positioning screen draws (PUT /matches/:id/officiating/:officialId) when there is no tracking
 * feed: physical load, presence samples, pressure through the match, weather. Mirrors the Worker's bounds. Pure.
 */

export const PITCH = { length: 105, width: 68 } as const;
export const MAX_HEAT_POINTS = 1500;
export const MAX_TIMELINE = 140;

export const PHYSICAL_FIELDS = ["distanceKm", "sprints", "topSpeed", "avgDistanceToBall", "diagonalAdherence"] as const;
export type PhysicalField = (typeof PHYSICAL_FIELDS)[number];
/** Upper bound of each physical value (all start at 0); `sprints` is a whole number. */
export const PHYSICAL_MAX: Record<PhysicalField, number> = { distanceKm: 20, sprints: 400, topSpeed: 45, avgDistanceToBall: 110, diagonalAdherence: 100 };

export interface PositioningValues extends Record<PhysicalField, string> {
  /** One sample per line: `x, y, intensity`. */
  heat: string;
  /** One value per line: `minute, pressure`. */
  timeline: string;
  weatherCondition: string;
  temperature: string;
  humidity: string;
}
export type PositioningField = keyof PositioningValues;
export type PositioningErrors = Partial<Record<PositioningField, TKey>>;

/** Was anything physical recorded? (A match with none carries zeros.) */
export const hasPhysical = (m: Pick<MatchRecord, "physical">) => PHYSICAL_FIELDS.some((f) => (m.physical?.[f] ?? 0) > 0);
/** Was anything at all recorded for the positioning screen? */
export const hasPositioning = (m: Pick<MatchRecord, "physical" | "heatPoints" | "pressureTimeline" | "weather">) =>
  hasPhysical(m) || m.heatPoints.length > 0 || m.pressureTimeline.length > 0 || !!m.weather;

const show = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** The form, filled with what the match already has. */
export function positioningValues(m: Pick<MatchRecord, "physical" | "heatPoints" | "pressureTimeline" | "weather">): PositioningValues {
  const physical = hasPhysical(m);
  return {
    distanceKm: physical ? show(m.physical.distanceKm) : "",
    sprints: physical ? show(m.physical.sprints) : "",
    topSpeed: physical ? show(m.physical.topSpeed) : "",
    avgDistanceToBall: physical ? show(m.physical.avgDistanceToBall) : "",
    diagonalAdherence: physical ? show(m.physical.diagonalAdherence) : "",
    heat: m.heatPoints.map((p) => `${p.x}, ${p.y}, ${p.intensity}`).join("\n"),
    timeline: m.pressureTimeline.map((p) => `${p.minute}, ${p.pressure}`).join("\n"),
    weatherCondition: m.weather?.condition ?? "",
    temperature: show(m.weather?.temperatureC),
    humidity: show(m.weather?.humidity),
  };
}

/** A plain decimal (a decimal comma is accepted); NaN for anything else, null for blank. */
export function decimal(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  return /^-?\d{1,4}([.,]\d{1,3})?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
}

const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;

/** Lines of numbers separated by commas, semicolons, tabs or spaces; null when any line is malformed or out of range. */
export function parseLines(text: string, bounds: Array<[number, number]>): number[][] | null {
  const rows: number[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells = line.trim().split(/\s*[;,\t]\s*|\s+/).filter(Boolean);
    if (cells.length !== bounds.length) return null;
    const nums = cells.map(Number);
    if (nums.some((n, i) => !inRange(n, bounds[i][0], bounds[i][1]))) return null;
    rows.push(nums);
  }
  return rows;
}

export const parseHeat = (text: string): HeatPoint[] | null =>
  parseLines(text, [[0, PITCH.length], [0, PITCH.width], [0, 1]])?.map(([x, y, intensity]) => ({ x, y, intensity })) ?? null;

export const parseTimeline = (text: string) => {
  const rows = parseLines(text, [[0, 130], [0, 100]]);
  if (!rows || rows.some(([minute]) => !Number.isInteger(minute))) return null;
  return rows.map(([minute, pressure]) => ({ minute, pressure }));
};

export function validatePositioning(v: PositioningValues): PositioningErrors {
  const e: PositioningErrors = {};
  const filled = PHYSICAL_FIELDS.filter((f) => v[f].trim() !== "");
  for (const f of filled) {
    const n = decimal(v[f]);
    if (n === null || !inRange(n, 0, PHYSICAL_MAX[f]) || (f === "sprints" && !Number.isInteger(n))) e[f] = "positioning.form.errors.number";
  }
  if (filled.length > 0 && filled.length < PHYSICAL_FIELDS.length) {
    for (const f of PHYSICAL_FIELDS) if (!filled.includes(f)) e[f] = "positioning.form.errors.partial";
  }
  const heat = parseHeat(v.heat);
  if (!heat) e.heat = "positioning.form.errors.lines";
  else if (heat.length > MAX_HEAT_POINTS) e.heat = "positioning.form.errors.tooMany";
  const timeline = parseTimeline(v.timeline);
  if (!timeline) e.timeline = "positioning.form.errors.lines";
  else if (timeline.length > MAX_TIMELINE) e.timeline = "positioning.form.errors.tooMany";
  else if (new Set(timeline.map((p) => p.minute)).size !== timeline.length) e.timeline = "positioning.form.errors.duplicateMinute";
  const condition = v.weatherCondition.trim();
  if (condition.length > 40 || (condition && !/^[\p{L}\p{N} .,'()/-]+$/u.test(condition))) e.weatherCondition = "positioning.form.errors.condition";
  const temp = decimal(v.temperature);
  if (temp !== null && !inRange(temp, -30, 60)) e.temperature = "positioning.form.errors.number";
  const hum = decimal(v.humidity);
  if (hum !== null && !inRange(hum, 0, 100)) e.humidity = "positioning.form.errors.number";
  if (!condition && (temp !== null || hum !== null)) e.weatherCondition = "positioning.form.errors.conditionRequired";
  return e;
}

export interface PositioningBody {
  physical: Record<PhysicalField, number> | null;
  heatPoints: HeatPoint[];
  pressureTimeline: Array<{ minute: number; pressure: number }>;
  weather: { condition: string; temperatureC: number | null; humidity: number | null } | null;
}

/** The request body of a valid form: everything is sent, so emptying a box clears what was recorded. */
export function toPositioningBody(v: PositioningValues): PositioningBody {
  const physicalFilled = PHYSICAL_FIELDS.every((f) => v[f].trim() !== "");
  const condition = v.weatherCondition.trim();
  return {
    physical: physicalFilled ? (Object.fromEntries(PHYSICAL_FIELDS.map((f) => [f, decimal(v[f])!])) as Record<PhysicalField, number>) : null,
    heatPoints: parseHeat(v.heat) ?? [],
    pressureTimeline: (parseTimeline(v.timeline) ?? []).sort((a, b) => a.minute - b.minute),
    weather: condition ? { condition, temperatureC: decimal(v.temperature), humidity: decimal(v.humidity) } : null,
  };
}
