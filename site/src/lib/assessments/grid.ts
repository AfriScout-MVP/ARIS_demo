import type { TKey } from "@/locales";
import type { Criterion } from "@/lib/store/types";

/* The platform's evaluation grid as an editable table. The Worker takes 2 to 12 criteria whose whole-number weights total 100. Pure. */

export const GRID_MIN = 2;
export const GRID_MAX = 12;
const KEY = /^[a-zA-Z][a-zA-Z0-9]{1,30}$/;

export interface GridRow {
  /** Kept for an existing criterion: filed reports store their marks under it. */
  key: string;
  fr: string;
  en: string;
  es: string;
  de: string;
  weight: string;
}

export type GridRowErrors = Partial<Record<"fr" | "en" | "es" | "de" | "weight", TKey>>;
export interface GridErrors {
  rows: Record<number, GridRowErrors>;
  /** About the grid as a whole (size, total). */
  grid: TKey | null;
}

export const gridRowsFrom = (criteria: Criterion[]): GridRow[] =>
  criteria.map((c) => ({ key: c.key, fr: c.label.fr ?? "", en: c.label.en ?? "", es: c.label.es ?? "", de: c.label.de ?? "", weight: String(c.weight) }));

/** "Gestion du match" → "gestionDuMatch": a key the Worker accepts, unique in the grid. */
export function keyFrom(label: string, taken: Iterable<string>): string {
  const words = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  let key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("");
  if (!/^[a-zA-Z]/.test(key)) key = `c${key}`;
  if (key.length < 2) key = "criterion";
  key = key.slice(0, 28);
  const used = new Set(taken);
  if (!used.has(key)) return key;
  for (let i = 2; ; i++) if (!used.has(`${key}${i}`)) return `${key}${i}`;
}

const weightOf = (raw: string) => (/^\d{1,3}$/.test(raw.trim()) ? Number(raw.trim()) : NaN);

/** The total of the weights that read as whole numbers. */
export const gridTotal = (rows: GridRow[]) => rows.reduce((s, r) => s + (Number.isNaN(weightOf(r.weight)) ? 0 : weightOf(r.weight)), 0);

export function validateGrid(rows: GridRow[]): GridErrors {
  const out: GridErrors = { rows: {}, grid: null };
  rows.forEach((r, i) => {
    const e: GridRowErrors = {};
    for (const l of ["fr", "en"] as const) {
      if (!r[l].trim()) e[l] = "assessments.grid.errors.label";
      else if (r[l].trim().length > 80) e[l] = "assessments.grid.errors.labelLong";
    }
    for (const l of ["es", "de"] as const) if (r[l].trim().length > 80) e[l] = "assessments.grid.errors.labelLong";
    const w = weightOf(r.weight);
    if (Number.isNaN(w) || w < 1 || w > 100) e.weight = "assessments.grid.errors.weight";
    if (Object.keys(e).length) out.rows[i] = e;
  });
  if (rows.length < GRID_MIN || rows.length > GRID_MAX) out.grid = "assessments.grid.errors.size";
  else if (gridTotal(rows) !== 100) out.grid = "assessments.grid.errors.total";
  return out;
}

export const hasGridErrors = (e: GridErrors) => e.grid !== null || Object.keys(e.rows).length > 0;

/** The body of `PUT /evaluation-criteria`, keys filled in for new rows. */
export function toGrid(rows: GridRow[]): Criterion[] {
  const taken = new Set(rows.map((r) => r.key).filter((k) => KEY.test(k)));
  return rows.map((r) => {
    let key = r.key;
    if (!KEY.test(key)) {
      key = keyFrom(r.en || r.fr, taken);
      taken.add(key);
    }
    const label: Criterion["label"] = { fr: r.fr.trim(), en: r.en.trim() };
    if (r.es.trim()) label.es = r.es.trim();
    if (r.de.trim()) label.de = r.de.trim();
    return { key, label, weight: weightOf(r.weight) };
  });
}

/** Criteria dropped from the grid: their past marks stay on filed reports, but nobody marks them again. */
export const removedCriteria = (before: Criterion[], rows: GridRow[]) => before.filter((c) => !rows.some((r) => r.key === c.key));

export const gridChanged = (before: Criterion[], rows: GridRow[]) => JSON.stringify(gridRowsFrom(before)) !== JSON.stringify(rows);

/** Spreads 100 over the rows as evenly as whole numbers allow (the first rows take the remainder). */
export function evenWeights(rows: GridRow[]): GridRow[] {
  if (rows.length === 0) return rows;
  const base = Math.floor(100 / rows.length);
  const extra = 100 - base * rows.length;
  return rows.map((r, i) => ({ ...r, weight: String(base + (i < extra ? 1 : 0)) }));
}
