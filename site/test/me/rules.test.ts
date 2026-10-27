import { describe, expect, it } from "vitest";
import type { EarningsPeriod, MyDesignation } from "@/lib/api/me";
import {
  appendPage,
  awaitingAnswer,
  canFileDefence,
  canWithdrawDay,
  countByView,
  datesBetween,
  designationsFor,
  hasConvocation,
  LIMITS,
  shiftDay,
  slipLines,
  totalsByCurrency,
  withinLimit,
} from "@/lib/me/rules";

const d = (fixtureId: string, state: MyDesignation["state"], extra: Partial<MyDesignation> = {}): MyDesignation => ({
  fixtureId,
  role: "R",
  state,
  version: 1,
  home: "A",
  away: "B",
  date: "2036-01-01",
  kickoff: "18:00",
  kickoffAt: "2036-01-01T18:00:00Z",
  venue: null,
  city: null,
  competition: "League",
  fixtureStatus: "validated",
  played: false,
  ...extra,
});

describe("designations", () => {
  const rows = [d("p", "pending"), d("c", "confirmed"), d("x", "declined"), d("old", "confirmed", { played: true }), d("late", "pending", { played: true })];

  it("separates what awaits an answer from what is coming up and what was declined", () => {
    expect(awaitingAnswer(rows).map((r) => r.fixtureId)).toEqual(["p"]);
    expect(designationsFor(rows, "upcoming").map((r) => r.fixtureId)).toEqual(["c"]);
    expect(designationsFor(rows, "declined").map((r) => r.fixtureId)).toEqual(["x"]);
    expect(designationsFor(rows, "all")).toHaveLength(5);
    expect(countByView(rows)).toEqual({ upcoming: 1, declined: 1, all: 5 });
  });

  it("has a convocation only once accepted and published", () => {
    expect(hasConvocation(d("a", "confirmed", { fixtureStatus: "published" }))).toBe(true);
    expect(hasConvocation(d("b", "confirmed", { fixtureStatus: "validated" }))).toBe(false);
    expect(hasConvocation(d("c", "pending", { fixtureStatus: "published" }))).toBe(false);
  });
});

describe("days off", () => {
  it("expands a range, capped at what the API accepts", () => {
    expect(datesBetween("2036-02-27", "2036-03-02")).toEqual(["2036-02-27", "2036-02-28", "2036-02-29", "2036-03-01", "2036-03-02"]);
    expect(datesBetween("2036-01-01", "2036-12-31")).toHaveLength(62);
    expect(datesBetween("2036-01-02", "2036-01-01")).toEqual([]);
    expect(shiftDay("2036-12-31", 1)).toBe("2037-01-01");
  });

  it("can be withdrawn from today on only", () => {
    expect(canWithdrawDay("2036-01-01", "2036-01-01")).toBe(true);
    expect(canWithdrawDay("2036-01-02", "2036-01-01")).toBe(true);
    expect(canWithdrawDay("2035-12-31", "2036-01-01")).toBe(false);
  });
});

describe("paging", () => {
  it("appends a page without repeating rows already shown", () => {
    const shown = [{ id: "a" }, { id: "b" }];
    expect(appendPage(shown, { rows: [{ id: "b" }, { id: "c" }], hasMore: false }, (r) => r.id)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });
});

describe("money", () => {
  const p = (period: string, currency: string, paid: number, pending: number, contested: number): EarningsPeriod => ({ period, currency, paid, pending, contested, lines: 1 });

  it("totals per currency, never across currencies", () => {
    expect(totalsByCurrency([p("2026/2027", "XOF", 100, 50, 0), p("2025/2026", "XOF", 10, 0, 5), p("2025/2026", "MAD", 7, 0, 0)])).toEqual([
      { currency: "MAD", paid: 7, pending: 0, contested: 0 },
      { currency: "XOF", paid: 110, pending: 50, contested: 5 },
    ]);
    expect(totalsByCurrency([])).toEqual([]);
  });

  it("prints the fee and the non-zero lines of a slip, the deduction as negative", () => {
    expect(slipLines({ base: 1000, transport: 0, lodging: 200, meals: 0, bonus: 0, deduction: 50 })).toEqual([
      { key: "base", amount: 1000 },
      { key: "lodging", amount: 200 },
      { key: "deduction", amount: -50 },
    ]);
    expect(slipLines({ base: 0, transport: 0, lodging: 0, meals: 0, bonus: 0, deduction: 0 })).toEqual([{ key: "base", amount: 0 }]);
  });
});

describe("self-service limits", () => {
  it("files a defence only before the decision", () => {
    expect(canFileDefence("opened")).toBe(true);
    expect(canFileDefence("hearing_scheduled")).toBe(true);
    expect(canFileDefence("decided")).toBe(false);
    expect(canFileDefence("appealed")).toBe(false);
  });

  it("mirrors the API's text bounds", () => {
    expect(withinLimit("  ok ", LIMITS.comment)).toBe(false);
    expect(withinLimit("fine", LIMITS.comment)).toBe(true);
    expect(withinLimit("x".repeat(2001), LIMITS.comment)).toBe(false);
    expect(withinLimit("too short", LIMITS.defence)).toBe(false);
  });
});
