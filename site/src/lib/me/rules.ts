// Pure rules behind the referee's own space (/me). No React here, so they are tested directly.
import type { DesignationState, EarningsPeriod, MyDesignation, Page } from "@/lib/api/me";

/** Every day from `from` to `to` inclusive, at most `max` of them (the API takes 62 at a time). */
export function datesBetween(from: string, to: string, max = 62) {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(`${from}T12:00:00Z`); d <= end && out.length < max; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const shiftDay = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** What the designations card shows: what is coming up (answered), what was declined, or all of it. */
export type DesignationView = "upcoming" | "declined" | "all";

/** Designations still waiting for the referee's answer. */
export const awaitingAnswer = (rows: MyDesignation[]) => rows.filter((d) => d.state === "pending" && !d.played);

export function designationsFor(rows: MyDesignation[], view: DesignationView) {
  if (view === "declined") return rows.filter((d) => d.state === "declined");
  if (view === "upcoming") return rows.filter((d) => d.state === "confirmed" && !d.played);
  return rows;
}

export function countByView(rows: MyDesignation[]): Record<DesignationView, number> {
  return { upcoming: designationsFor(rows, "upcoming").length, declined: designationsFor(rows, "declined").length, all: rows.length };
}

/** A convocation exists for an accepted designation once the federation has published the crew. */
export const hasConvocation = (d: Pick<MyDesignation, "state" | "fixtureStatus">) => d.state === "confirmed" && d.fixtureStatus === "published";

export const DESIGNATION_TONE: Record<DesignationState, "amber" | "pitch" | "neutral"> = { pending: "amber", confirmed: "pitch", declined: "neutral" };

/** A day off the referee may still take back: today or later (the past is the record of what happened). */
export const canWithdrawDay = (date: string, today: string) => date >= today;

/** Appends a "load more" page, dropping rows already shown (a row may shift pages when new ones arrive). */
export function appendPage<T>(shown: T[], page: Page<T>, keyOf: (row: T) => string): T[] {
  const seen = new Set(shown.map(keyOf));
  return [...shown, ...page.rows.filter((r) => !seen.has(keyOf(r)))];
}

export interface CurrencyTotal {
  currency: string;
  paid: number;
  pending: number;
  contested: number;
}

/** Totals across the periods shown, one row per currency (amounts in different currencies never add up). */
export function totalsByCurrency(periods: EarningsPeriod[]): CurrencyTotal[] {
  const by = new Map<string, CurrencyTotal>();
  for (const p of periods) {
    const t = by.get(p.currency) ?? { currency: p.currency, paid: 0, pending: 0, contested: 0 };
    t.paid += p.paid;
    t.pending += p.pending;
    t.contested += p.contested;
    by.set(p.currency, t);
  }
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export type SlipLine = "base" | "transport" | "lodging" | "meals" | "bonus" | "deduction";
export const SLIP_LINES: SlipLine[] = ["base", "transport", "lodging", "meals", "bonus", "deduction"];

/** The lines of a payment slip worth printing (the fee always, the rest when not zero); a deduction counts negative. */
export function slipLines(p: Record<SlipLine, number>) {
  return SLIP_LINES.filter((k) => k === "base" || p[k] !== 0).map((k) => ({ key: k, amount: k === "deduction" ? -p[k] : p[k] }));
}

/** A written defence is filed while the case is open (before any decision). */
export const canFileDefence = (status: string) => status === "opened" || status === "hearing_scheduled";

/** Bounds the API enforces on free text, mirrored so a form can say so before sending. */
export const LIMITS = { comment: [3, 2000], defence: [10, 5000] } as const;
export const withinLimit = (text: string, [min, max]: readonly [number, number]) => text.trim().length >= min && text.trim().length <= max;
