import { describe, expect, it } from "vitest";
import type { FeeRow, WorkloadRow } from "@/lib/api/reports";
import { csvHref } from "@/lib/api/reports";
import { confirmationRate, defaultRange, feeTotals, incidentsByKind, issueCounts, n, presetRange, validRange, workloadSummary } from "@/lib/analytics/rules";

const TODAY = "2026-10-23";

describe("ranges", () => {
  it("defaults to thirty days either side, like the Worker", () => {
    expect(defaultRange(TODAY)).toEqual({ from: "2026-09-23", to: "2026-11-22" });
  });
  it("offers presets, the season running July to June", () => {
    expect(presetRange("last30", TODAY)).toEqual({ from: "2026-09-23", to: TODAY });
    expect(presetRange("next30", TODAY)).toEqual({ from: TODAY, to: "2026-11-22" });
    expect(presetRange("season", TODAY)).toEqual({ from: "2026-07-01", to: "2027-06-30" });
    expect(presetRange("season", "2027-03-01")).toEqual({ from: "2026-07-01", to: "2027-06-30" });
  });
  it("refuses reversed, malformed or absurdly long ranges", () => {
    expect(validRange({ from: "2026-10-01", to: "2026-10-31" })).toBe(true);
    expect(validRange({ from: "2026-10-31", to: "2026-10-01" })).toBe(false);
    expect(validRange({ from: "2026-10", to: "2026-10-31" })).toBe(false);
    expect(validRange({ from: "2020-01-01", to: "2026-01-01" })).toBe(false);
  });
});

describe("csvHref", () => {
  it("asks the Worker for the same report as CSV, with the period and the country", () => {
    const href = csvHref("fees", { from: "2026-10-01", to: "2026-10-31", country: "SEN" }, { groupBy: "city" });
    expect(href).toBe("/api/v1/reports/fees?from=2026-10-01&to=2026-10-31&format=csv&country=SEN&groupBy=city");
    expect(csvHref("workload", { from: "2026-10-01", to: "2026-10-31" })).not.toContain("country");
  });
});

describe("reading the figures", () => {
  it("treats SQL NULL sums as zero", () => {
    expect(n(null)).toBe(0);
    expect(n(undefined)).toBe(0);
    expect(n(4)).toBe(4);
  });
  it("computes the confirmation rate of upcoming slots", () => {
    expect(confirmationRate({ pending: 2, confirmed: 6, declined: 0 })).toBe(75);
    expect(confirmationRate({})).toBeNull();
  });
  it("summarises the workload", () => {
    const row = (appointments: number, flag: WorkloadRow["flag"] = null): WorkloadRow => ({
      officialId: String(appointments) + String(flag), name: "x", countryCode: "SEN", kind: "referee", status: "active", appointments, asReferee: 0, lastDate: null, nextDate: null, flag,
    });
    expect(workloadSummary([row(8, "overused"), row(2), row(2), row(0, "unused")])).toEqual({ officials: 4, appointments: 12, overused: 1, unused: 1, spread: 2 });
    expect(workloadSummary([]).spread).toBeNull();
  });
  it("totals fees per currency, never across them", () => {
    const fee = (currency: string, total: number, paid: number): FeeRow => ({ key: "k", currency, lines: 1, total, paid, validated: 0, due: total - paid, contested: 0 });
    expect(feeTotals([fee("XOF", 100, 50), fee("XOF", 40, 40), fee("BWP", 10, 0)])).toEqual([
      { currency: "XOF", total: 140, paid: 90, validated: 0, due: 50, contested: 0, lines: 2 },
      { currency: "BWP", total: 10, paid: 0, validated: 0, due: 10, contested: 0, lines: 1 },
    ]);
  });
  it("counts reconciliation issues and incidents by kind", () => {
    const issue = (i: "played-not-billed" | "paid-not-played") => ({ issue: i }) as Parameters<typeof issueCounts>[0][number];
    expect(issueCounts([issue("played-not-billed"), issue("played-not-billed"), issue("paid-not-played")])).toEqual({ "played-not-billed": 2, "paid-not-played": 1, "paid-unvalidated": 0 });
    expect(incidentsByKind([{ kind: "absence", n: 1 }, { kind: "lateness", n: 3 }, { kind: "absence", n: 1 }])).toEqual([{ kind: "lateness", count: 3 }, { kind: "absence", count: 2 }]);
  });
});
