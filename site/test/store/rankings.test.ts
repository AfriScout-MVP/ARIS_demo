import { beforeEach, describe, expect, it } from "vitest";
import { applySnapshot, kpis, arpsDelta, rankingsFor, refereeById, resetStore, zoneDistribution } from "@/lib/store";
import { referee, snapshot } from "./fixtures";

beforeEach(() => {
  resetStore();
  applySnapshot(snapshot());
});

describe("rankingsFor", () => {
  it("ranks by ARPS across the given countries", () => {
    const rows = rankingsFor(["AAA", "BBB"]);
    expect(rows.map((r) => [r.rank, r.refereeId])).toEqual([[1, "r1"], [2, "r3"], [3, "r2"]]);
    expect(rows[0]).toMatchObject({ zone: "UNAF", level: "CAF Elite", delta: 2 });
  });

  it("is scoped to the countries asked for", () => {
    expect(rankingsFor(["BBB"]).map((r) => r.refereeId)).toEqual(["r3"]);
    expect(rankingsFor([])).toEqual([]);
  });
});

describe("headline figures", () => {
  it("are computed from what is loaded, with no invented extras", () => {
    const k = kpis();
    expect(k).toMatchObject({ refereesTracked: 3, assistantsTracked: 2, federations: 2, competitions: 3, avgArps: 81.7, decisionsReviewed: 0 });
    expect(k.varAccuracy).toBe(95);
  });

  it("report no VAR accuracy when nobody is VAR-qualified", () => {
    resetStore();
    applySnapshot(snapshot({ referees: [referee("z", "AAA")] }));
    expect(kpis().varAccuracy).toBeNull();
  });

  it("have no ARPS change without history", () => {
    expect(arpsDelta()).toBeNull();
  });

  it("take the ARPS change from the last two months", () => {
    resetStore();
    applySnapshot(snapshot({ analytics: { arpsTrend: [{ month: "2030-01", score: 80 }, { month: "2030-02", score: 81.5 }], decisionsBreakdown: [] } }));
    expect(arpsDelta()).toBe(1.5);
  });
});

describe("zoneDistribution", () => {
  it("lists only zones that have a country", () => {
    const rows = zoneDistribution();
    expect(rows.map((r) => r.zone)).toEqual(["UNAF", "COSAFA"]);
    expect(rows[0]).toMatchObject({ referees: 2, countries: 1, avgArps: 80 });
  });
});
