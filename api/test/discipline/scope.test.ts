import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, patch, post, type World } from "../helpers/evaluation";

let w: World;
let caseA: string;
let incA: string;
let caseB: string;
let incB: string;

beforeAll(async () => {
  w = await makeWorld("DXA", "DXB");
  incA = (await post(w.seatA, "/incidents", { kind: "incident", officialId: "DXA-ref1", description: "Incident of country A" })).json.incident.id;
  incB = (await post(w.seatB, "/incidents", { kind: "incident", officialId: "DXB-ref1", description: "Incident of country B" })).json.incident.id;
  caseA = (await post(w.seatA, "/cases", { officialId: "DXA-ref1", summary: "Case of country A" })).json.case.id;
  caseB = (await post(w.seatB, "/cases", { officialId: "DXB-ref1", summary: "Case of country B" })).json.case.id;
});

describe("discipline is confined to the official's country", () => {
  it("lists only the caller's country, all for an admin", async () => {
    expect((await get(w.seatA, "/incidents")).json.incidents.map((i: { id: string }) => i.id)).toEqual([incA]);
    expect((await get(w.seatB, "/incidents")).json.incidents.map((i: { id: string }) => i.id)).toEqual([incB]);
    expect((await get(w.seatA, "/cases")).json.cases.map((c: { id: string }) => c.id)).toEqual([caseA]);
    expect((await get(w.admin, "/cases")).json.cases).toHaveLength(2);
    expect((await get(w.admin, "/incidents?country=dxb")).json.incidents.map((i: { id: string }) => i.id)).toEqual([incB]);
    expect((await get(w.seatA, "/cases?officialId=DXB-ref1")).json.cases).toEqual([]);
    expect((await get(w.seatA, "/incidents?country=DXB")).json.incidents).toEqual([]);
  });

  it("answers 404 for a foreign official, incident or case on every route, with no side effect", async () => {
    const before = await sql("SELECT (SELECT COUNT(*) FROM incidents) AS i, (SELECT COUNT(*) FROM disciplinary_cases) AS c, (SELECT status FROM disciplinary_cases WHERE id = ?) AS s", caseB).first();
    expect((await post(w.seatA, "/incidents", { kind: "incident", officialId: "DXB-ref1", description: "Report on a foreign official" })).status).toBe(404);
    expect((await post(w.seatA, "/cases", { officialId: "DXB-ref1", summary: "Case against a foreign official" })).status).toBe(404);
    expect((await patch(w.seatA, `/incidents/${incB}`, { status: "closed" })).status).toBe(404);
    expect((await post(w.seatA, `/cases/${caseB}/hearing`, { hearingAt: "2030-03-01" })).status).toBe(404);
    expect((await post(w.seatA, `/cases/${caseB}/decide`, { sanction: "none", decision: "Foreign decision" })).status).toBe(404);
    expect((await post(w.seatA, `/cases/${caseB}/appeal`, { note: "Foreign appeal attempt" })).status).toBe(404);
    expect((await post(w.seatA, `/cases/${caseB}/close`, { note: "Foreign close" })).status).toBe(404);
    expect(await sql("SELECT (SELECT COUNT(*) FROM incidents) AS i, (SELECT COUNT(*) FROM disciplinary_cases) AS c, (SELECT status FROM disciplinary_cases WHERE id = ?) AS s", caseB).first()).toEqual(before);
  });

  it("keeps a referee out of other people's cases and incidents", async () => {
    expect((await post(w.refA2, `/cases/${caseA}/appeal`, { note: "Not mine to appeal" })).status).toBe(404);
    expect((await post(w.refB1, `/cases/${caseA}/appeal`, { note: "Not mine to appeal" })).status).toBe(404);
    expect((await get(w.refA2, "/incidents")).json.incidents).toEqual([]);
  });
});
