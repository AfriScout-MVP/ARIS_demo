// The money side of a designation, as the back office reads it. Pure functions: tested in test/finance.
import type { Tone } from "@/components/ui";
import type {
  Advance,
  AdvanceStatus,
  CheckField,
  CrewRole,
  FeeScale,
  MoneyField,
  Payment,
  PaymentStatus,
  Tier,
} from "@/lib/api/finance";
import type { TKey } from "@/locales";

export const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  due: "amber",
  validated: "var",
  paid: "pitch",
  contested: "red",
  cancelled: "neutral",
};

export const ADVANCE_TONE: Record<AdvanceStatus, Tone> = {
  requested: "amber",
  approved: "var",
  paid: "pitch",
  settled: "neutral",
  rejected: "red",
};

export const paymentStatusKey = (s: PaymentStatus) => `finance.status.${s}` as TKey;
export const advanceStatusKey = (s: AdvanceStatus) => `finance.advances.status.${s}` as TKey;
export const tierKey = (t: Tier) => `finance.tiers.${t}` as TKey;
export const checkKey = (c: CheckField) => `finance.checks.${c}` as TKey;
export const moneyKey = (m: MoneyField) => `finance.money.${m}` as TKey;

export const CHECKS: CheckField[] = ["presenceConfirmed", "matchValidated", "expensesVerified"];
export const MONEY: MoneyField[] = ["transport", "lodging", "meals", "bonus", "deduction"];

/** The same moves the Worker allows (`advances.post("/:id/decide")`). */
export const ADVANCE_NEXT: Record<AdvanceStatus, Array<Exclude<AdvanceStatus, "requested">>> = {
  requested: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: ["settled"],
  settled: [],
  rejected: [],
};

/* ------------------------------------------------------------- payments */

export const missingChecks = (p: Pick<Payment, CheckField>) => CHECKS.filter((c) => !p[c]);

export type PaymentAction = "check" | "adjust" | "validate" | "pay" | "resolve" | "cancel";

/** What a staff member can do to a line right now. Mirrors the Worker's guards so no button leads to a 409. */
export function paymentActions(p: Pick<Payment, "status" | CheckField>): PaymentAction[] {
  switch (p.status) {
    case "due":
      return ["check", "adjust", ...(missingChecks(p).length === 0 ? (["validate"] as const) : []), "cancel"];
    case "validated":
      return ["check", "adjust", "pay", "cancel"];
    case "contested":
      return ["adjust", "resolve", "cancel"];
    default:
      return [];
  }
}

export interface CurrencyTotals {
  currency: string;
  lines: number;
  due: number;
  validated: number;
  paid: number;
  contested: number;
  /** Still to pay: due + validated + contested. */
  outstanding: number;
}

/** Totals per currency — ARIS has no exchange rate, so amounts in different currencies are never added together. */
export function totalsByCurrency(rows: Payment[]): CurrencyTotals[] {
  const by = new Map<string, CurrencyTotals>();
  for (const p of rows) {
    if (p.status === "cancelled") continue;
    const t = by.get(p.currency) ?? { currency: p.currency, lines: 0, due: 0, validated: 0, paid: 0, contested: 0, outstanding: 0 };
    t.lines += 1;
    t[p.status] += p.total;
    if (p.status !== "paid") t.outstanding += p.total;
    by.set(p.currency, t);
  }
  return [...by.values()].sort((a, b) => b.lines - a.lines || a.currency.localeCompare(b.currency));
}

export type PaymentView = PaymentStatus | "open" | "all";

export interface PaymentFilter {
  q: string;
  view: PaymentView;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const OPEN: PaymentStatus[] = ["due", "validated", "contested"];

export function filterPayments(rows: Payment[], f: PaymentFilter): Payment[] {
  const q = fold(f.q.trim());
  return rows.filter((p) => {
    if (f.view === "open" ? !OPEN.includes(p.status) : f.view !== "all" && p.status !== f.view) return false;
    if (!q) return true;
    return [p.officialName, p.home, p.away, p.city ?? "", p.paymentRef ?? "", p.officialId, p.role].some((s) => fold(s).includes(q));
  });
}

export function countByView(rows: Payment[]): Record<PaymentView, number> {
  const out: Record<PaymentView, number> = { open: 0, all: rows.length, due: 0, validated: 0, paid: 0, contested: 0, cancelled: 0 };
  for (const p of rows) {
    out[p.status] += 1;
    if (OPEN.includes(p.status)) out.open += 1;
  }
  return out;
}

/** Of a selection, the lines one bulk action applies to; the rest are skipped and counted. */
export function bulkTargets(rows: Payment[], action: "check" | "validate" | "pay") {
  const ok = rows.filter((p) => {
    const can = paymentActions(p);
    if (action === "check") return can.includes("check") && missingChecks(p).length > 0;
    return can.includes(action);
  });
  return { ok, skipped: rows.length - ok.length };
}

/** A line's total once `patch` is applied: base + expenses + bonus − deduction. */
export function totalWith(p: Pick<Payment, "base" | MoneyField>, patch: Partial<Record<MoneyField, number>>) {
  const v = { ...p, ...patch };
  return v.base + v.transport + v.lodging + v.meals + v.bonus - v.deduction;
}

/* ------------------------------------------------------- ready to bill */

interface BillableFixture {
  id: string;
  date: string;
  designationStatus: string;
  crew: Array<{ role: CrewRole; officialId: string | null; state: string }>;
}

export interface BillingGap<F extends BillableFixture = BillableFixture> {
  fixture: F;
  /** Confirmed roles with no line for the official who holds them. */
  roles: CrewRole[];
}

/**
 * Matches whose crew is validated but whose confirmed officials are not all billed — the amounts nobody has
 * generated yet. A line held by someone else (an official who was replaced) counts as not billed.
 */
export function billingGaps<F extends BillableFixture>(fixtures: F[], payments: Payment[]): BillingGap<F>[] {
  const billed = new Set(payments.filter((p) => p.status !== "cancelled").map((p) => `${p.fixtureId}|${p.role}|${p.officialId}`));
  const gaps: BillingGap<F>[] = [];
  for (const f of fixtures) {
    if (f.designationStatus !== "validated" && f.designationStatus !== "published") continue;
    const roles = f.crew
      .filter((s) => s.state === "confirmed" && s.officialId && !billed.has(`${f.id}|${s.role}|${s.officialId}`))
      .map((s) => s.role);
    if (roles.length) gaps.push({ fixture: f, roles });
  }
  return gaps.sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));
}

/* ------------------------------------------------------------ fee scales */

export interface ScaleTarget {
  tier: Tier;
  competitionId: string;
  role: CrewRole;
  /** The federation whose fixture it is (null: no federation on ARIS for that country). */
  federationId: string | null;
  /** The currency the country pays in; null when unknown. */
  currency: string | null;
}

/** The scale generation would use, ranked exactly as the Worker ranks them; null when none fits. */
export function bestScale(scales: FeeScale[], t: ScaleTarget): FeeScale | null {
  const fits = scales.filter(
    (s) =>
      s.role === t.role &&
      (s.competitionId === t.competitionId || (s.competitionId === null && s.tier === t.tier)) &&
      (s.federationId === null || s.federationId === t.federationId) &&
      (!t.currency || s.currency.toUpperCase() === t.currency.toUpperCase()),
  );
  const rank = (s: FeeScale) => (s.competitionId ? 0 : 2) + (s.federationId ? 0 : 1);
  return fits.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export interface ScaleGap {
  competitionId: string;
  role: CrewRole;
  /** "missing": no scale at all; "currency": only in another currency, which generation refuses to use. */
  reason: "missing" | "currency";
}

/** For every competition of a federation and every role its crews carry, the roles generation could not price. */
export function scaleGaps(
  scales: FeeScale[],
  competitions: Array<{ id: string; tier: Tier; varEnabled: boolean }>,
  federationId: string | null,
  currency: string | null,
): ScaleGap[] {
  const gaps: ScaleGap[] = [];
  for (const comp of competitions) {
    const roles: CrewRole[] = ["R", "AR1", "AR2", "FOURTH", ...(comp.varEnabled ? (["VAR", "AVAR"] as const) : []), "OBS"];
    for (const role of roles) {
      const target = { tier: comp.tier, competitionId: comp.id, role, federationId, currency };
      if (bestScale(scales, target)) continue;
      gaps.push({ competitionId: comp.id, role, reason: bestScale(scales, { ...target, currency: null }) ? "currency" : "missing" });
    }
  }
  return gaps;
}

/** A tier's scales as a grid row per role: the tier scale (competition-specific ones are listed apart). */
export function scaleGrid(scales: FeeScale[]) {
  const tierRows = new Map<Tier, Map<CrewRole, FeeScale>>();
  const specific: FeeScale[] = [];
  for (const s of scales) {
    if (s.competitionId) {
      specific.push(s);
      continue;
    }
    const row = tierRows.get(s.tier) ?? new Map<CrewRole, FeeScale>();
    row.set(s.role, s);
    tierRows.set(s.tier, row);
  }
  return { tierRows, specific };
}

/* -------------------------------------------------------------- advances */

export function advanceTotals(rows: Advance[]) {
  const by = new Map<string, { currency: string; requested: number; outstanding: number }>();
  for (const a of rows) {
    const t = by.get(a.currency) ?? { currency: a.currency, requested: 0, outstanding: 0 };
    if (a.status === "requested") t.requested += a.amount;
    // approved or paid but not yet settled: money the federation is still owed a justification for
    if (a.status === "approved" || a.status === "paid") t.outstanding += a.amount;
    by.set(a.currency, t);
  }
  return [...by.values()];
}

/* ------------------------------------------------------------------- csv */

/** RFC 4180 CSV with a BOM, so a spreadsheet opens accents correctly. Cells starting with = + - @ are neutralised. */
export function toCsv(header: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
