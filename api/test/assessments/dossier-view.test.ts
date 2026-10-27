import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { MARKS, addPlayedMatch, get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
let mine: string;
let theirs: string;
beforeAll(async () => {
  w = await makeWorld("DVA", "DVB");
  mine = (await addPlayedMatch({ country: "DVA", competition: "DVA-d1", referee: "DVA-ref1", crew: { AR1: "DVA-as1", OBS: "DVA-obs" } })).matchId;
  theirs = (await addPlayedMatch({ country: "DVB", competition: "DVB-d1", referee: "DVB-ref1" })).matchId;
  const filed = await post(w.seatA, "/assessments", { matchId: mine, observerId: "DVA-obs", marks: MARKS });
  if (filed.status !== 201) throw new Error(filed.text);
});

describe("GET /dossiers/:id", () => {
  it("returns the printable dossier from the records, with the sections chosen when it was built", async () => {
    const made = await post(w.seatA, "/dossiers", { matchId: mine, pages: 9, recipients: ["DVAFF"], sections: ["observer", "summary", "crew"] });
    expect(made.status).toBe(201);
    const res = await get(w.seatA, `/dossiers/${made.json.id}`);
    expect(res.status).toBe(200);
    const d = res.json;
    // stored in print order, whatever order they were sent in
    expect(d.dossier).toMatchObject({ id: made.json.id, matchId: mine, pages: 9, recipients: ["DVAFF"], sections: ["summary", "observer", "crew"], countryCode: "DVA" });
    expect(d.match).toMatchObject({ id: mine, refereeId: "DVA-ref1", score: "2–1" });
    expect(d.referee).toMatchObject({ id: "DVA-ref1", name: "Official DVA-ref1" });
    expect(d.crew.map((r: { role: string }) => r.role)).toEqual(["R", "AR1", "OBS"]);
    expect(d.reports).toHaveLength(1);
    expect(d.reports[0]).toMatchObject({ observerId: "DVA-obs", overall: 8.1, marks: MARKS });
    expect(d.criteria.map((c: { key: string }) => c.key)).toContain("positioning");
    expect(d.country).toMatchObject({ code: "DVA", federation: "DVAFF", federationName: "Federation DVA" });
    expect(d.competition).toMatchObject({ id: "DVA-d1" });
    // the list carries the sections too
    expect((await get(w.seatA, "/dossiers")).json.dossiers[0].sections).toEqual(["summary", "observer", "crew"]);
  });

  it("defaults to every section and rejects unknown ones", async () => {
    const made = await post(w.admin, "/dossiers", { matchId: mine, recipients: ["CAF"] });
    expect((await get(w.admin, `/dossiers/${made.json.id}`)).json.dossier.sections).toEqual(["summary", "decisions", "positioning", "observer", "crew", "comparison"]);
    expect((await post(w.admin, "/dossiers", { matchId: mine, recipients: ["CAF"], sections: ["gossip"] })).status).toBe(422);
  });

  it("answers 401 signed out, 403 to a referee and 404 for an unknown id", async () => {
    const id = (await sql("SELECT id FROM dossiers WHERE match_id = ? LIMIT 1", mine).first<{ id: string }>())!.id;
    expect((await get(null, `/dossiers/${id}`)).status).toBe(401);
    expect((await get(w.refA1, `/dossiers/${id}`)).status).toBe(403);
    expect((await get(w.seatA, "/dossiers/dos-nope")).status).toBe(404);
  });

  it("does not cross countries: another federation's dossier is 404, the admin reads both", async () => {
    const made = await post(w.seatB, "/dossiers", { matchId: theirs, recipients: ["DVBFF"] });
    expect(made.status).toBe(201);
    const res = await get(w.seatA, `/dossiers/${made.json.id}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("DVB-ref1");
    expect((await get(w.admin, `/dossiers/${made.json.id}`)).status).toBe(200);
    expect((await get(w.seatB, `/dossiers/${made.json.id}`)).status).toBe(200);
  });
});
