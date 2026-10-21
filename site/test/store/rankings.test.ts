import { beforeEach, describe, expect, it } from "vitest";
import { applySnapshot, getSubIndices, kpis, arpsDelta, rankingsFor, refereeById, resetStore, zoneDistribution } from "@/lib/store";
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

describe("getSubIndices", () => {
  it("stays inside the 55..99 band", () => {
    const low = getSubIndices(referee("x", "AAA", { varAccuracy: 10, cards: { yellow: 0, red: 80 }, rmcsAvg: 10, fitness: 0, arps: 0, trend: 40 }));
    Object.values(low).forEach((v) => expect(v).toBe(55));
    const high = getSubIndices(referee("y", "AAA", { varAccuracy: 100, rmcsAvg: 100, fitness: 100, arps: 100, trend: 0, cards: { yellow: 0, red: 0 } }));
    expect(high.mds).toBe(99);
    expect(high.ci).toBe(99);
  });

  it("derives from the referee's own record", () => {
    const sub = getSubIndices(refereeById.get("r1")!);
    expect(sub.ras).toBe(90);
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
