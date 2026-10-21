import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { makeWorld, put, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("TFA", "TFB");
});

const passed = { date: "2026-09-01", test1: { result: "passed", bestSprint: 6.4 }, test2: { result: "passed", laps: 40 } };
const row = (id: string) => sql("SELECT * FROM fitness_tests WHERE official_id = ?", id).first<Record<string, any>>();

describe("physical tests", () => {
  it("records a result, and replaces it on the next one", async () => {
    expect((await put(w.seatA, "/fitness/TFA-ref1", passed)).status).toBe(200);
    expect(await row("TFA-ref1")).toMatchObject({ test1_result: "passed", best_sprint: 6.4, laps: 40, retest_date: null });
    await put(w.seatA, "/fitness/TFA-ref1", { ...passed, date: "2027-03-01", test2: { result: "passed", laps: 44 } });
    expect(await row("TFA-ref1")).toMatchObject({ date: "2027-03-01", laps: 44 });
    expect((await sql("SELECT COUNT(*) AS n FROM fitness_tests WHERE official_id = 'TFA-ref1'").first<{ n: number }>())!.n).toBe(1);
  });

  it("needs a retest date after a failure, and drops it after a pass", async () => {
    const failed = { ...passed, test1: { result: "failed", bestSprint: 7.9 } };
    expect((await put(w.seatA, "/fitness/TFA-ref2", failed)).json.error.code).toBe("retest_required");
    expect(await row("TFA-ref2")).toBeNull();
    expect((await put(w.seatA, "/fitness/TFA-ref2", { ...failed, retestDate: "2026-10-01" })).status).toBe(200);
    expect((await row("TFA-ref2"))!.retest_date).toBe("2026-10-01");
    await put(w.seatA, "/fitness/TFA-ref2", { ...passed, retestDate: "2026-10-01" });
    expect((await row("TFA-ref2"))!.retest_date).toBeNull();
  });

  it("validates the body", async () => {
    expect((await put(w.seatA, "/fitness/TFA-obs", { ...passed, date: "yesterday" })).status).toBe(422);
    expect((await put(w.seatA, "/fitness/TFA-obs", { ...passed, test1: { result: "passed", bestSprint: 1 } })).status).toBe(422);
    expect((await put(w.seatA, "/fitness/TFA-obs", { ...passed, test2: { result: "maybe", laps: 3 } })).status).toBe(422);
    expect(await row("TFA-obs")).toBeNull();
  });

  it("answers 401, 403 and the cross-country 404 without writing", async () => {
    expect((await put(null, "/fitness/TFA-obs", passed)).status).toBe(401);
    expect((await put(w.refA1, "/fitness/TFA-ref1", passed)).status).toBe(403);
    expect((await put(w.seatB, "/fitness/TFA-obs", passed)).status).toBe(404);
    expect((await put(w.seatA, "/fitness/TFB-ref1", passed)).status).toBe(404);
    expect((await put(w.seatA, "/fitness/nobody", passed)).status).toBe(404);
    expect(await row("TFA-obs")).toBeNull();
    expect(await row("TFB-ref1")).toBeNull();
    expect((await put(w.admin, "/fitness/TFB-ref1", passed)).status).toBe(200);
  });
});
