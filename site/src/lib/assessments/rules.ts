import type { TKey } from "@/locales";
import type { Locale } from "@/locales";
import type { Clip, MatchRow } from "@/lib/api/assessments";
import type { Criterion, Localized } from "@/lib/store/types";

/* The observer's report: marks on the platform grid, notes, clips. Pure: tested on its own. */

/** Same rounding as the Worker: weighted on the grid (weights total 100), one decimal. */
export function weightedOverall(marks: Record<string, number>, grid: Criterion[]): number {
  const total = grid.reduce((sum, c) => sum + (marks[c.key] ?? 0) * c.weight, 0) / 100;
  return Math.round(total * 10) / 10;
}

/** "7,5" or "7.5" → 7.5; null when empty or outside 0–10 with at most one decimal. */
export function parseMark(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!/^(10(\.0)?|\d(\.\d)?)$/.test(t)) return null;
  return Number(t);
}

export interface ReportValues {
  /** As typed, one per criterion key. */
  marks: Record<string, string>;
  notes: string;
  clips: Array<{ minute: string; text: string }>;
}

export interface ReportErrors {
  marks: Record<string, TKey>;
  clips: Record<number, TKey>;
  form?: TKey;
}

export const hasReportErrors = (e: ReportErrors) => Object.keys(e.marks).length > 0 || Object.keys(e.clips).length > 0 || Boolean(e.form);

/** A filed report must mark every criterion; a draft may leave some blank, but what is typed must be valid. */
export function validateReport(v: ReportValues, grid: Criterion[], filing: boolean): ReportErrors {
  const e: ReportErrors = { marks: {}, clips: {} };
  for (const c of grid) {
    const raw = v.marks[c.key] ?? "";
    if (raw.trim() === "") {
      if (filing) e.marks[c.key] = "assessments.form.errors.markRequired";
    } else if (parseMark(raw) === null) e.marks[c.key] = "assessments.form.errors.mark";
  }
  if (v.notes.length > 4000) e.form = "assessments.form.errors.notes";
  if (v.clips.length > 20) e.form = "assessments.form.errors.clips";
  v.clips.forEach((clip, i) => {
    const m = clip.minute.trim();
    if (!/^\d{1,3}$/.test(m) || Number(m) > 130) e.clips[i] = "assessments.form.errors.minute";
    else if (!clip.text.trim() || clip.text.trim().length > 120) e.clips[i] = "assessments.form.errors.clipText";
  });
  return e;
}

export function marksOf(v: ReportValues): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(v.marks)) {
    const n = parseMark(raw);
    if (n !== null) out[key] = n;
  }
  return out;
}

/** The observer writes in their own language: the text goes under that locale (the others stay empty). */
export function notesFor(text: string, locale: Locale): Localized {
  const t = text.trim();
  return { fr: locale === "fr" ? t : "", en: locale === "en" ? t : "", ...(locale === "es" ? { es: t } : {}), ...(locale === "de" ? { de: t } : {}) };
}

/**
 * A clip label is one line in the observer's words. The Worker requires French and English, so the same
 * line stands for both until someone translates it (and under the observer's own locale too).
 */
export function clipsFor(clips: ReportValues["clips"], locale: Locale): Clip[] {
  return clips
    .map((c) => ({ minute: Number(c.minute.trim()), text: c.text.trim() }))
    .sort((a, b) => a.minute - b.minute)
    .map(({ minute, text }) => ({ minute, label: { fr: text, en: text, ...(locale === "es" ? { es: text } : {}), ...(locale === "de" ? { de: text } : {}) } }));
}

export function valuesFrom(report: { marks: Record<string, number>; notes: Localized; clips: Clip[] } | null, grid: Criterion[], locale: Locale, pick: (l: Localized) => string): ReportValues {
  return {
    marks: Object.fromEntries(grid.map((c) => [c.key, report && c.key in report.marks ? String(report.marks[c.key]) : ""])),
    notes: report ? (report.notes[locale] ?? pick(report.notes)) : "",
    clips: report ? report.clips.map((c) => ({ minute: String(c.minute), text: pick(c.label) })) : [],
  };
}

export interface Duty<R> {
  match: MatchRow;
  report: R | null;
}

/** The matches a referee was appointed to observe (not those they refereed), with their own report on each. */
export function observerDuties<R extends { matchId: string; observerId: string }>(matches: MatchRow[], reports: R[], me: string): Duty<R>[] {
  return matches
    .filter((m) => m.refereeId !== me)
    .map((match) => ({ match, report: reports.find((r) => r.matchId === match.id && r.observerId === me) ?? null }))
    .sort((a, b) => b.match.date.localeCompare(a.match.date));
}

/** 48 hours after kick-off, as the observers are told. */
export const isLate = (matchDate: string, now: Date) => now.getTime() - Date.parse(`${matchDate}T23:59:59Z`) > 48 * 3_600_000;
