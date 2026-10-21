import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { MARKS, addPlayedMatch, get, makeWorld, official, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("AAA", "AAB");
  // known starting figures for the referee under test
  await sql("UPDATE officials SET arps = 80, rmcs_avg = 80, trend = 0, matches = 0 WHERE id = 'AAA-ref1'").run();
  await sql("UPDATE officials SET arps = 0, rmcs_avg = 0, trend = 0, matches = 0 WHERE id = 'AAA-ref2'").run();
});

const file = async (referee: string, marks: Record<string, number> = MARKS, opts: { analyticsArps?: number } = {}) => {
  const { matchId } = await addPlayedMatch({ country: "AAA", competition: "AAA-d1", referee, ...opts });
  const res = await post(w.seatA, "/assessments", { matchId, observerId: "AAA-obs", marks, notes: { fr: "x", en: "x" } });
  expect(res.status).toBe(201);
  return { matchId, id: res.json.assessment.id as string };
};

describe("keeping the referee's figures current", () => {
  it("moves rmcs_avg, trend and arps a step (0.1) towards the filed report and counts the match", async () => {
    const { matchId } = await file("AAA-ref1"); // overall 8.1 → 81.0 (8.05 stored as 8.1)
    const o = await official("AAA-ref1");
    expect(o.rmcs_avg).toBeCloseTo(80.1, 1); // 80*0.9 + 81*0.1
    expect(o.trend).toBeCloseTo(0.1, 1);
    expect(o.arps).toBeCloseTo(80.1, 1);
    expect(o.matches).toBe(1);
    const m = (await get(w.seatA, `/matches/${matchId}`)).json.match;
    expect(m.rmcs).toBe(81); // the match carries the report's 0–100 mark
  });

  it("a very first observation sets the figures outright", async () => {
    await file("AAA-ref2", { ...MARKS, fitness: 6 });
    const o = await official("AAA-ref2");
    expect(o.rmcs_avg).toBe(77); // overall 7.65 is stored as 7.7, times ten
    expect(o.arps).toBe(o.rmcs_avg);
    expect(o.trend).toBe(0);
  });

  it("blends the analytics ARPS of the match with the report when the tracking feed supplied one", async () => {
    await sql("UPDATE officials SET arps = 70 WHERE id = 'AAA-ref1'").run();
    await file("AAA-ref1", MARKS, { analyticsArps: 91 });
    // observation = (81 + 91) / 2 = 86 → 70*0.9 + 86*0.1 = 71.6
    expect((await official("AAA-ref1")).arps).toBeCloseTo(71.6, 1);
  });

  it("applies a correction once, as the difference, and never touches figures for a draft", async () => {
    await sql("UPDATE officials SET arps = 80, rmcs_avg = 80, trend = 0 WHERE id = 'AAA-ref1'").run();
    const { id } = await file("AAA-ref1"); // 80 → 80.1
    const before = await official("AAA-ref1");
    const fixed = await patch(w.seatA, `/assessments/${id}`, { marks: { ...MARKS, fitness: 0 }, reason: "Fitness mark was wrong" }); // 8.1 → 7.1
    expect(fixed.json.assessment.overall).toBeCloseTo(7.1, 1);
    const after = await official("AAA-ref1");
    expect(after.rmcs_avg - before.rmcs_avg).toBeCloseTo(-1.0, 1); // 0.1 × (71 − 81)
    expect(after.arps - before.arps).toBeCloseTo(-1.0, 1);

    const { matchId } = await addPlayedMatch({ country: "AAA", competition: "AAA-d1", referee: "AAA-ref1" });
    const snap = await official("AAA-ref1");
    await post(w.seatA, "/assessments", { matchId, observerId: "AAA-obs", marks: { positioning: 1 }, state: "draft" });
    expect((await official("AAA-ref1")).rmcs_avg).toBe(snap.rmcs_avg);
  });

  it("never lowers the matches counter below what is already recorded", async () => {
    await sql("UPDATE officials SET matches = 142 WHERE id = 'AAA-ref1'").run();
    await file("AAA-ref1");
    expect((await official("AAA-ref1")).matches).toBe(142);
  });

  it("does not touch another country's referee when a federation of another country is refused", async () => {
    const { matchId } = await addPlayedMatch({ country: "AAA", competition: "AAA-d1", referee: "AAA-ref1" });
    const snap = await official("AAA-ref1");
    expect((await post(w.seatB, "/assessments", { matchId, observerId: "AAB-obs", marks: MARKS })).status).toBe(404);
    expect(await official("AAA-ref1")).toEqual(snap);
  });
});
