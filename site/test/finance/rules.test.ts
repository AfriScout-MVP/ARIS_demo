import { describe, expect, it } from "vitest";
import type { Advance, FeeScale, Payment } from "@/lib/api/finance";
import {
  advanceTotals,
  bestScale,
  billingGaps,
  bulkTargets,
  countByView,
  filterPayments,
  missingChecks,
  paymentActions,
  scaleGaps,
  scaleGrid,
  toCsv,
  totalsByCurrency,
  totalWith,
} from "@/lib/finance/rules";

const base: Payment = {
  id: "p1", fixtureId: "f1", role: "R", officialId: "o1", officialName: "Aïssatou Ndiaye", countryCode: "SEN", officialCountryCode: "SEN",
  base: 20000, transport: 2000, lodging: 0, meals: 1000, bonus: 0, deduction: 0, total: 23000, currency: "XOF",
  status: "due", presenceConfirmed: false, matchValidated: false, expensesVerified: false, validatedAt: null, paidAt: null,
  paymentRef: null, contestNote: null, createdAt: "", home: "Jaraaf", away: "Casa Sports", date: "2026-10-01",
  kickoffAt: "2026-10-01T18:00:00Z", city: "Dakar", competitionId: "SEN-d1",
};
const pay = (over: Partial<Payment>): Payment => ({ ...base, ...over });
const allChecks = { presenceConfirmed: true, matchValidated: true, expensesVerified: true };

describe("paymentActions", () => {
  it("offers validation only once the three checks are done", () => {
    expect(paymentActions(base)).toEqual(["check", "adjust", "cancel"]);
    expect(paymentActions(pay(allChecks))).toEqual(["check", "adjust", "validate", "cancel"]);
    expect(missingChecks(pay({ presenceConfirmed: true }))).toEqual(["matchValidated", "expensesVerified"]);
  });
  it("pays only a validated line, resolves only a contested one, and closes paid and cancelled lines", () => {
    expect(paymentActions(pay({ status: "validated", ...allChecks }))).toContain("pay");
    expect(paymentActions(pay({ status: "contested" }))).toEqual(["adjust", "resolve", "cancel"]);
    expect(paymentActions(pay({ status: "paid" }))).toEqual([]);
    expect(paymentActions(pay({ status: "cancelled" }))).toEqual([]);
  });
});

describe("totals", () => {
  it("never adds two currencies together and leaves cancelled lines out", () => {
    const totals = totalsByCurrency([
      base,
      pay({ id: "p2", status: "paid", total: 10000 }),
      pay({ id: "p3", status: "contested", total: 5000 }),
      pay({ id: "p4", currency: "MAD", total: 900 }),
      pay({ id: "p5", status: "cancelled", total: 99999 }),
    ]);
    expect(totals).toEqual([
      { currency: "XOF", lines: 3, due: 23000, validated: 0, paid: 10000, contested: 5000, outstanding: 28000 },
      { currency: "MAD", lines: 1, due: 900, validated: 0, paid: 0, contested: 0, outstanding: 900 },
    ]);
  });
  it("recomputes a line's total from an adjustment", () => {
    expect(totalWith(base, { bonus: 5000, deduction: 1000 })).toBe(27000);
    expect(totalWith(base, {})).toBe(23000);
  });
});

describe("filterPayments", () => {
  const rows = [base, pay({ id: "p2", status: "paid", officialName: "Moussa", paymentRef: "VIR-12" }), pay({ id: "p3", status: "cancelled" })];
  it("shows the open lines by default and searches without accents", () => {
    expect(filterPayments(rows, { q: "", view: "open" }).map((p) => p.id)).toEqual(["p1"]);
    expect(filterPayments(rows, { q: "aissatou", view: "all" }).map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(filterPayments(rows, { q: "vir-12", view: "all" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filterPayments(rows, { q: "casa", view: "paid" }).map((p) => p.id)).toEqual(["p2"]);
  });
  it("counts every view", () => {
    expect(countByView(rows)).toMatchObject({ open: 1, all: 3, due: 1, paid: 1, cancelled: 1 });
  });
});

describe("bulkTargets", () => {
  it("keeps only the lines each action applies to", () => {
    const rows = [base, pay({ id: "p2", ...allChecks }), pay({ id: "p3", status: "validated", ...allChecks }), pay({ id: "p4", status: "paid", ...allChecks })];
    expect(bulkTargets(rows, "check").ok.map((p) => p.id)).toEqual(["p1"]);
    expect(bulkTargets(rows, "validate")).toMatchObject({ skipped: 3 });
    expect(bulkTargets(rows, "validate").ok.map((p) => p.id)).toEqual(["p2"]);
    expect(bulkTargets(rows, "pay").ok.map((p) => p.id)).toEqual(["p3"]);
  });
});

describe("billingGaps", () => {
  const fx = (id: string, status: string, crew: Array<[string, string | null, string]>) => ({
    id, date: `2026-10-0${id.slice(1)}`, designationStatus: status,
    crew: crew.map(([role, officialId, state]) => ({ role: role as Payment["role"], officialId, state })),
  });
  it("lists confirmed officials of validated matches who have no line of their own", () => {
    const fixtures = [
      fx("f1", "validated", [["R", "o1", "confirmed"], ["AR1", "o2", "confirmed"], ["AR2", null, "empty"]]),
      fx("f2", "draft", [["R", "o3", "confirmed"]]),
      fx("f3", "published", [["R", "o4", "confirmed"]]),
    ];
    const payments = [base, pay({ id: "p9", fixtureId: "f3", officialId: "o4" })];
    expect(billingGaps(fixtures, payments).map((g) => [g.fixture.id, g.roles])).toEqual([["f1", ["AR1"]]]);
  });
  it("treats a line held by a replaced official, or a cancelled one, as not billed", () => {
    const fixtures = [fx("f1", "validated", [["R", "o7", "confirmed"]])];
    expect(billingGaps(fixtures, [base])).toHaveLength(1);
    expect(billingGaps([fx("f1", "validated", [["R", "o1", "confirmed"]])], [pay({ status: "cancelled" })])).toHaveLength(1);
  });
});

describe("fee scales", () => {
  const sc = (over: Partial<FeeScale>): FeeScale => ({
    id: Math.random().toString(36), tier: "d1", competitionId: null, federationId: null, federationCode: null, role: "R",
    amount: 1, transport: 0, lodging: 0, meals: 0, currency: "XOF", effectiveFrom: null, readonly: false, ...over,
  });
  const scales = [
    sc({ amount: 10 }),
    sc({ amount: 20, federationId: "fed" }),
    sc({ amount: 30, competitionId: "SEN-cup", tier: "cup" }),
    sc({ amount: 40, federationId: "other" }),
    sc({ amount: 50, role: "AR1", currency: "MAD" }),
  ];
  const target = { tier: "d1" as const, competitionId: "SEN-d1", role: "R" as const, federationId: "fed", currency: "XOF" };
  it("ranks like the Worker: competition, then the federation's tier scale, then the platform default", () => {
    expect(bestScale(scales, target)?.amount).toBe(20);
    expect(bestScale(scales, { ...target, federationId: null })?.amount).toBe(10);
    expect(bestScale(scales, { ...target, tier: "cup", competitionId: "SEN-cup" })?.amount).toBe(30);
    expect(bestScale(scales, { ...target, federationId: "nobody" })?.amount).toBe(10);
  });
  it("never uses a scale in another currency", () => {
    expect(bestScale(scales, { ...target, role: "AR1" })).toBeNull();
    expect(bestScale(scales, { ...target, role: "AR1", currency: "MAD" })?.amount).toBe(50);
  });
  it("names every role a competition could not price, and why", () => {
    const gaps = scaleGaps(scales, [{ id: "SEN-d1", tier: "d1", varEnabled: false }], "fed", "XOF");
    expect(gaps.find((g) => g.role === "AR1")).toEqual({ competitionId: "SEN-d1", role: "AR1", reason: "currency" });
    expect(gaps.find((g) => g.role === "FOURTH")?.reason).toBe("missing");
    expect(gaps.some((g) => g.role === "R")).toBe(false);
    expect(gaps.some((g) => g.role === "VAR")).toBe(false);
    expect(scaleGaps(scales, [{ id: "SEN-d1", tier: "d1", varEnabled: true }], "fed", "XOF").some((g) => g.role === "VAR")).toBe(true);
  });
  it("lays tier scales out per role and keeps competition-specific ones apart", () => {
    const grid = scaleGrid(scales.filter((s) => s.federationId !== "other" && s.federationId !== "fed"));
    expect(grid.tierRows.get("d1")?.get("R")?.amount).toBe(10);
    expect(grid.specific.map((s) => s.amount)).toEqual([30]);
  });
});

describe("advanceTotals", () => {
  it("separates what is asked for from what is out and not yet settled", () => {
    const a = (status: Advance["status"], amount: number): Advance => ({
      id: status, officialId: "o", officialName: "", countryCode: "SEN", fixtureId: null, amount, currency: "XOF",
      justification: "", status, requestedAt: "", decidedAt: null,
    });
    expect(advanceTotals([a("requested", 5), a("approved", 7), a("paid", 11), a("settled", 13), a("rejected", 17)])).toEqual([
      { currency: "XOF", requested: 5, outstanding: 18 },
    ]);
  });
});

describe("toCsv", () => {
  it("quotes what needs quoting and neutralises formulas", () => {
    const csv = toCsv(["a", "b"], [["x,y", 3], ['say "hi"', null], ["=1+1", -5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["a,b", '"x,y",3', '"say ""hi""",', "'=1+1,-5", ""]);
  });
});
