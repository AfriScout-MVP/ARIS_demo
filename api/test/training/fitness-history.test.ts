import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, put, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("THA", "THB");
});

const test = (date: string, laps: number, result: "passed" | "failed" = "passed") => ({
  date,
  test1: { result, bestSprint: 6.2 },
  test2: { result: "passed", laps },
  retestDate: result === "failed" ? "2027-12-01" : null,
});
const current = (id: string) => sql("SELECT * FROM fitness_tests WHERE official_id = ?", id).first<Record<string, any>>();

describe("fitness history", () => {
  it("keeps every test, newest first, while the current row follows the latest date", async () => {
    await put(w.seatA, "/fitness/THA-ref1", test("2026-03-01", 40));
    await put(w.seatA, "/fitness/THA-ref1", test("2027-03-01", 44, "failed"));
    // an older test entered later fills the history without rewinding the current one
    await put(w.seatA, "/fitness/THA-ref1", test("2025-03-01", 38));
    const res = await get(w.seatA, "/officials/THA-ref1/fitness");
    expect(res.status).toBe(200);
    expect(res.json.history.map((h: { date: string }) => h.date)).toEqual(["2027-03-01", "2026-03-01", "2025-03-01"]);
    expect(res.json.history[0]).toMatchObject({ test1: { result: "failed", bestSprint: 6.2 }, test2: { result: "passed", laps: 44 }, retestDate: "2027-12-01", passed: false });
    expect(res.json.current).toMatchObject({ date: "2027-03-01", passed: false });
    expect(await current("THA-ref1")).toMatchObject({ date: "2027-03-01", laps: 44 });
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'fitness.record' AND entity_id = 'THA-ref1'").first<{ n: number }>())!.n).toBe(3);
  });

  it("pages", async () => {
    const page = await get(w.seatA, "/officials/THA-ref1/fitness?limit=2");
    expect(page.json).toMatchObject({ limit: 2, offset: 0, hasMore: true });
    expect(page.json.history).toHaveLength(2);
    const next = await get(w.seatA, "/officials/THA-ref1/fitness?limit=2&offset=2");
    expect(next.json.hasMore).toBe(false);
    expect(next.json.history.map((h: { date: string }) => h.date)).toEqual(["2025-03-01"]);
    expect((await get(w.seatA, "/officials/THA-ref1/fitness?limit=0")).status).toBe(422);
  });

  it("still shows a current test recorded before the history existed", async () => {
    await sql("INSERT INTO fitness_tests (official_id, date, test1_result, best_sprint, test2_result, laps) VALUES ('THA-ref2', '2024-05-05', 'passed', 6.0, 'passed', 41)").run();
    const res = await get(w.refA2, "/officials/THA-ref2/fitness");
    expect(res.json.history).toHaveLength(1);
    expect(res.json.history[0]).toMatchObject({ date: "2024-05-05", passed: true });
  });

  it("is the official's own, their federation's and the admin's to read", async () => {
    expect((await get(w.refA1, "/officials/THA-ref1/fitness")).status).toBe(200);
    expect((await get(w.admin, "/officials/THA-ref1/fitness")).status).toBe(200);
    expect((await get(null, "/officials/THA-ref1/fitness")).status).toBe(401);
    expect((await get(w.refA2, "/officials/THA-ref1/fitness")).status).toBe(403);
    expect((await get(w.seatB, "/officials/THA-ref1/fitness")).status).toBe(404);
    expect((await get(w.seatA, "/officials/nobody/fitness")).status).toBe(404);
  });
});
