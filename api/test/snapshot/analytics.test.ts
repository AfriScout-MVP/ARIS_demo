import { beforeAll, describe, expect, it } from "vitest";
import { api, sql } from "../helpers";
import { snapshotWorld, WINDOW, type SnapshotWorld } from "./support";

let w: SnapshotWorld;
const analytics = async (s: SnapshotWorld[keyof SnapshotWorld]) => (await api("GET", `/api/v1${WINDOW}`, { session: s as never })).json.analytics;
beforeAll(async () => {
  w = await snapshotWorld();
});

describe("analytics.arpsTrend", () => {
  it("is the continental history for an admin, oldest first", async () => {
    expect((await analytics(w.admin)).arpsTrend).toEqual([
      { month: "2031-04", score: 6.8 },
      { month: "2031-05", score: 7 },
    ]);
  });

  it("is the federation's own country history for a federation", async () => {
    expect((await analytics(w.egy)).arpsTrend).toEqual([{ month: "2031-05", score: 7.5 }]);
    expect((await analytics(w.mar)).arpsTrend).toEqual([{ month: "2031-05", score: 6.5 }]);
  });

  it("keeps only the latest twelve months", async () => {
    for (let m = 1; m <= 14; m++) await sql("INSERT OR REPLACE INTO performance_history (month, country_code, avg_arps) VALUES (?, 'MAR', 5)", `2029-${String(m > 12 ? m - 12 : m).padStart(2, "0")}`).run();
    expect((await analytics(w.mar)).arpsTrend.length).toBeLessThanOrEqual(12);
  });
});

describe("analytics.decisionsBreakdown", () => {
  it("splits correct / correct-var / overturned into percentages that add up to 100", async () => {
    // each country has 1 correct, 1 confirmed by VAR, 1 overturned → 33/33/34 summing to exactly 100
    const b = (await analytics(w.egy)).decisionsBreakdown;
    expect(b.map((x: { id: string }) => x.id)).toEqual(["correct", "correct-var", "overturned"]);
    expect(b.reduce((n: number, x: { value: number }) => n + x.value, 0)).toBe(100);
    expect(Math.max(...b.map((x: { value: number }) => x.value))).toBeLessThanOrEqual(34);
  });

  it("counts only the visible matches", async () => {
    // add 3 more VAR-confirmed decisions to MAR: MAR's mix changes, EGY's does not
    for (let i = 0; i < 3; i++) {
      await sql("INSERT INTO match_decisions (id, match_id, minute, type, description, initial_call, var_review, final_call, confidence, pressure_index, distance) VALUES (?, 'm-MAR', ?, 'Foul', '{\"en\":\"x\",\"fr\":\"x\"}', 'given', 1, 'confirmed', 0.9, 1, 10)", `extra-${i}`, 60 + i).run();
    }
    const egy = (await analytics(w.egy)).decisionsBreakdown;
    const mar = (await analytics(w.mar)).decisionsBreakdown;
    expect(mar.find((x: { id: string }) => x.id === "correct-var").value).toBeGreaterThan(egy.find((x: { id: string }) => x.id === "correct-var").value);
    const all = (await analytics(w.admin)).decisionsBreakdown;
    expect(all.reduce((n: number, x: { value: number }) => n + x.value, 0)).toBe(100);
  });

  it("is an empty array when there are no decisions", async () => {
    await sql("DELETE FROM match_decisions").run();
    expect((await analytics(w.admin)).decisionsBreakdown).toEqual([]);
    expect((await analytics(w.egy)).decisionsBreakdown).toEqual([]);
  });
});
