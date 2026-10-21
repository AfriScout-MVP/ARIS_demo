import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
let mine: string;
let theirs: string;
beforeAll(async () => {
  w = await makeWorld("ADA", "ADB");
  mine = (await addPlayedMatch({ country: "ADA", competition: "ADA-d1", referee: "ADA-ref1" })).matchId;
  theirs = (await addPlayedMatch({ country: "ADB", competition: "ADB-d1", referee: "ADB-ref1" })).matchId;
});

describe("dossiers", () => {
  it("are generated for a match of the caller's country and listed with it", async () => {
    const res = await post(w.seatA, "/dossiers", { matchId: mine, pages: 8, recipients: ["CAF", "FRMF"] });
    expect(res.status).toBe(201);
    const list = (await get(w.seatA, "/dossiers")).json.dossiers;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ matchId: mine, pages: 8, recipients: ["CAF", "FRMF"], countryCode: "ADA" });
    const log = await sql("SELECT country_code FROM audit_log WHERE action = 'dossier.generate' AND entity_id = ?", mine).first<{ country_code: string }>();
    expect(log!.country_code).toBe("ADA");
  });

  it("validates the body", async () => {
    expect((await post(w.seatA, "/dossiers", { matchId: mine, recipients: [] })).status).toBe(422);
    expect((await post(w.seatA, "/dossiers", { matchId: mine, pages: 0, recipients: ["x"] })).status).toBe(422);
  });

  it("answers 401 and 403", async () => {
    expect((await get(null, "/dossiers")).status).toBe(401);
    expect((await get(w.refA1, "/dossiers")).status).toBe(403);
    expect((await post(w.refA1, "/dossiers", { matchId: mine, recipients: ["x"] })).status).toBe(403);
  });

  it("do not cross countries: a foreign match is 404, a foreign dossier is not listed", async () => {
    expect((await post(w.seatA, "/dossiers", { matchId: theirs, recipients: ["x"] })).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM dossiers WHERE match_id = ?", theirs).first<{ n: number }>())!.n).toBe(0);
    await post(w.seatB, "/dossiers", { matchId: theirs, recipients: ["y"] });
    expect((await get(w.seatA, "/dossiers")).json.dossiers.map((d: { matchId: string }) => d.matchId)).toEqual([mine]);
    expect((await get(w.admin, "/dossiers")).json.dossiers).toHaveLength(2);
  });
});
