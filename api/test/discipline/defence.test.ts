import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
let open: string;
beforeAll(async () => {
  w = await makeWorld("DFA", "DFB");
  open = (await post(w.seatA, "/cases", { officialId: "DFA-ref1", summary: "Left the stadium before the report was signed" })).json.case.id;
});

const statement = "I left after signing the match sheet, as the commissioner confirmed to me.";

describe("a written defence on a case", () => {
  it("is filed by the official concerned before the decision, and the federation hears of it", async () => {
    const res = await post(w.refA1, `/cases/${open}/defence`, { statement });
    expect(res.status).toBe(201);
    expect((await get(w.refA1, `/cases/${open}/defence`)).json.defence).toMatchObject({ statement });
    expect((await get(w.seatA, `/cases/${open}/defence`)).json.defence).toMatchObject({ statement });
    expect(JSON.stringify((await get(w.seatA, "/notifications")).json)).toContain("Defence statement filed");
    expect(JSON.stringify((await get(w.seatB, "/notifications")).json)).not.toContain("Defence statement filed");
    // it can be revised until the decision
    const again = await post(w.refA1, `/cases/${open}/defence`, { statement: `${statement} Witnesses: the fourth official.` });
    expect([again.status, again.json.updated]).toEqual([200, true]);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'case.defence%' AND entity_id = ?", open).first<{ n: number }>())!.n).toBe(2);
  });

  it("is closed once the case is decided", async () => {
    await post(w.seatA, `/cases/${open}/decide`, { decision: "Warning issued", decisionRef: "DC-2026-01", sanction: "warning" });
    const res = await post(w.refA1, `/cases/${open}/defence`, { statement });
    expect([res.status, res.json.error.code]).toEqual([409, "case_decided"]);
  });

  it("belongs to the official concerned only", async () => {
    const other = (await post(w.seatA, "/cases", { officialId: "DFA-ref2", summary: "Late arrival at the stadium" })).json.case.id;
    expect((await post(w.refA1, `/cases/${other}/defence`, { statement })).status).toBe(404);
    expect((await get(w.refA1, `/cases/${other}/defence`)).status).toBe(404);
    expect((await post(w.seatA, `/cases/${other}/defence`, { statement })).status).toBe(403);
    expect((await get(w.seatB, `/cases/${other}/defence`)).status).toBe(404);
    expect((await post(null, `/cases/${other}/defence`, { statement })).status).toBe(401);
    expect((await post(w.refA2, `/cases/${other}/defence`, { statement: "too short" })).status).toBe(422);
    expect((await get(w.refA2, `/cases/${other}/defence`)).json.defence).toBeNull();
    expect((await sql("SELECT COUNT(*) AS n FROM case_defences WHERE case_id = ?", other).first<{ n: number }>())!.n).toBe(0);
  });
});
