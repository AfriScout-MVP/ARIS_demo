import type { FeeRow, IssueRow, Overview, WorkloadRow } from "@/lib/api/reports";

/* Reading the dashboards. Pure: tested on its own. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Worker's own default: thirty days either side of today. */
export const defaultRange = (today: string) => ({ from: shift(today, -30), to: shift(today, 30) });

export const PRESETS = ["last30", "next30", "around30", "season"] as const;
export type Preset = (typeof PRESETS)[number];

export function presetRange(p: Preset, today: string): { from: string; to: string } {
  if (p === "last30") return { from: shift(today, -30), to: today };
  if (p === "next30") return { from: today, to: shift(today, 30) };
  if (p === "season") {
    const y = Number(today.slice(0, 4));
    const start = Number(today.slice(5, 7)) >= 7 ? y : y - 1;
    return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
  }
  return defaultRange(today);
}

/** A range the Worker accepts: two real days, in order, at most two years apart (a longer one is a typing mistake). */
export function validRange(r: { from: string; to: string }): boolean {
  if (!DAY.test(r.from) || !DAY.test(r.to) || r.from > r.to) return false;
  return Date.parse(`${r.to}T12:00:00Z`) - Date.parse(`${r.from}T12:00:00Z`) <= 731 * 86_400_000;
}

/** `SUM()` over nothing is NULL in SQL. */
export const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Share of upcoming crew slots already confirmed by the official. */
export function confirmationRate(slots: Overview["designations"]["slots"]): number | null {
  const total = Object.values(slots).reduce((s, v) => s + n(v), 0);
  return total ? Math.round((n(slots.confirmed) / total) * 100) : null;
}

export function workloadSummary(rows: WorkloadRow[]) {
  const used = rows.filter((r) => r.appointments > 0);
  return {
    officials: rows.length,
    appointments: rows.reduce((s, r) => s + r.appointments, 0),
    overused: rows.filter((r) => r.flag === "overused").length,
    unused: rows.filter((r) => r.flag === "unused").length,
    /** max / mean among those who worked: 1 is perfectly even. */
    spread: used.length ? Math.round((Math.max(...used.map((r) => r.appointments)) / (used.reduce((s, r) => s + r.appointments, 0) / used.length)) * 10) / 10 : null,
  };
}

/** One total per currency — ARIS never converts between them. */
export function feeTotals(rows: FeeRow[]) {
  const by = new Map<string, { currency: string; total: number; paid: number; validated: number; due: number; contested: number; lines: number }>();
  for (const r of rows) {
    const t = by.get(r.currency) ?? { currency: r.currency, total: 0, paid: 0, validated: 0, due: 0, contested: 0, lines: 0 };
    t.total += n(r.total);
    t.paid += n(r.paid);
    t.validated += n(r.validated);
    t.due += n(r.due);
    t.contested += n(r.contested);
    t.lines += n(r.lines);
    by.set(r.currency, t);
  }
  return [...by.values()].sort((a, b) => b.lines - a.lines || a.currency.localeCompare(b.currency));
}

export function issueCounts(issues: IssueRow[]) {
  return {
    "played-not-billed": issues.filter((i) => i.issue === "played-not-billed").length,
    "paid-not-played": issues.filter((i) => i.issue === "paid-not-played").length,
    "paid-unvalidated": issues.filter((i) => i.issue === "paid-unvalidated").length,
  };
}

/** Incidents of the period, by kind, all statuses together. */
export function incidentsByKind(rows: Array<{ kind: string; n: number }>) {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.kind, (by.get(r.kind) ?? 0) + n(r.n));
  return [...by.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}
