import { beforeAll, describe, expect, it } from "vitest";
import { api, sql } from "../helpers";
import { GRID, get, makeWorld, put, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("AGA", "AGB");
});

const two = [{ key: "a1", label: { fr: "A", en: "A" }, weight: 60 }, { key: "b1", label: { fr: "B", en: "B" }, weight: 40 }];

describe("the evaluation grid", () => {
  it("is readable by every signed-in role, with Localized labels, and not by the public", async () => {
    for (const s of [w.admin, w.seatA, w.refA1]) {
      const res = await get(s, "/evaluation-criteria");
      expect(res.status).toBe(200);
      expect(res.json.criteria.reduce((t: number, c: { weight: number }) => t + c.weight, 0)).toBe(100);
      expect(res.json.criteria[0].label).toHaveProperty("fr");
    }
    expect((await get(null, "/evaluation-criteria")).status).toBe(401);
  });

  it("is changed only by the administrator, logged, and must total 100", async () => {
    expect((await put(w.seatA, "/evaluation-criteria", { criteria: two })).status).toBe(403);
    expect((await put(w.refA1, "/evaluation-criteria", { criteria: two })).status).toBe(403);
    expect((await put(null, "/evaluation-criteria", { criteria: two })).status).toBe(401);
    expect((await put(w.admin, "/evaluation-criteria", { criteria: [{ ...two[0], weight: 60 }, { ...two[1], weight: 30 }] })).status).toBe(422);
    expect((await put(w.admin, "/evaluation-criteria", { criteria: [two[0], { ...two[0], weight: 40 }] })).status).toBe(422);
    expect((await put(w.admin, "/evaluation-criteria", { criteria: [two[0], { key: "c1", label: { fr: "", en: "C" }, weight: 40 }] })).status).toBe(422);
    expect((await get(w.refA1, "/evaluation-criteria")).json.criteria).toHaveLength(GRID.length); // nothing changed

    expect((await put(w.admin, "/evaluation-criteria", { criteria: two })).status).toBe(200);
    expect((await get(w.seatB, "/evaluation-criteria")).json.criteria.map((c: { key: string }) => c.key)).toEqual(["a1", "b1"]);
    const log = await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'criteria.set'").first<{ n: number }>();
    expect(log!.n).toBeGreaterThanOrEqual(2);
    await api("PUT", "/api/v1/evaluation-criteria", { session: w.admin, body: { criteria: GRID } });
  });
});
