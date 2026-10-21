import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { MARKS, addPlayedMatch, get, makeWorld, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("AOA", "AOB");
});

const body = (matchId: string, extra: object = {}) => ({ matchId, marks: MARKS, notes: { fr: "Rapport", en: "Report" }, ...extra });
const match = (crew: Record<string, string> = { OBS: "AOA-obs" }) => addPlayedMatch({ country: "AOA", competition: "AOA-d1", referee: "AOA-ref1", crew });

describe("a referee account designated OBS files the report", () => {
  it("files as themselves (observerId is their own official, whatever the body says)", async () => {
    const { matchId } = await match();
    const res = await post(w.obsA, "/assessments", body(matchId, { observerId: "AOA-ref2" }));
    expect(res.status).toBe(201);
    expect(res.json.assessment).toMatchObject({ observerId: "AOA-obs", refereeId: "AOA-ref1", state: "filed", published: false });
  });

  it("tells the federation of that country, and only that country", async () => {
    const { matchId } = await match();
    await post(w.obsA, "/assessments", body(matchId));
    const titles = (s: typeof w.seatA) => get(s, "/notifications").then((r) => r.json.notifications.map((n: { title: { en: string } }) => n.title.en));
    expect(await titles(w.seatA)).toContain("Assessment report filed");
    expect(await titles(w.seatB)).not.toContain("Assessment report filed");
  });

  it("refuses a referee who was not designated OBS (403), even if the match does not exist", async () => {
    const { matchId } = await match();
    expect((await post(w.refA2, "/assessments", body(matchId))).status).toBe(403);
    expect((await post(w.refB1, "/assessments", body(matchId))).status).toBe(403);
    expect((await post(w.refA2, "/assessments", body("no-such-match"))).status).toBe(403);
  });

  it("refuses a referee on the match they refereed themselves, and on their own performance", async () => {
    // refA1 refereed; they are not OBS there
    const { matchId } = await match();
    expect((await post(w.refA1, "/assessments", body(matchId))).status).toBe(403);
    // inconsistent data: OBS slot holder is also recorded as the match's referee
    const odd = await match({ OBS: "AOA-obs" });
    await sql("UPDATE matches SET referee_id = 'AOA-obs' WHERE id = ?", odd.matchId).run();
    expect((await post(w.obsA, "/assessments", body(odd.matchId))).json.error.code).toBe("self_assessment");
  });

  it("refuses a declined OBS designation", async () => {
    const { matchId, fixtureId } = await match();
    await sql("UPDATE designations SET state = 'declined' WHERE fixture_id = ? AND role = 'OBS'", fixtureId).run();
    expect((await post(w.obsA, "/assessments", body(matchId))).status).toBe(403);
  });

  it("lets the observer edit their own draft but not a filed report", async () => {
    const { matchId } = await match();
    const draft = await post(w.obsA, "/assessments", body(matchId, { marks: { positioning: 6 }, state: "draft" }));
    expect(draft.status).toBe(201);
    const id = draft.json.assessment.id;
    expect((await patch(w.refA2, `/assessments/${id}`, { marks: MARKS, file: true })).status).toBe(404);
    expect((await patch(w.obsA, `/assessments/${id}`, { marks: MARKS, file: true })).json.assessment.state).toBe("filed");
    expect((await patch(w.obsA, `/assessments/${id}`, { marks: { ...MARKS, fitness: 1 }, reason: "oops" })).status).toBe(403);
  });

  it("shows the observer their own reports and the matches they observe, but not other matches", async () => {
    const { matchId } = await match();
    await post(w.obsA, "/assessments", body(matchId));
    const mine = (await get(w.obsA, "/assessments")).json.assessments;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a: { observerId: string }) => a.observerId === "AOA-obs")).toBe(true);
    expect((await get(w.obsA, "/matches")).json.matches.some((m: { id: string }) => m.id === matchId)).toBe(true);
    expect((await get(w.refA2, "/matches")).json.matches.some((m: { id: string }) => m.id === matchId)).toBe(false);
    expect((await get(w.obsA, `/matches/${matchId}`)).status).toBe(200);
    expect((await get(w.refA2, `/matches/${matchId}`)).status).toBe(404);
  });

  it("keeps a federation of another country out of it", async () => {
    const { matchId } = await match();
    expect((await post(w.seatB, "/assessments", body(matchId, { observerId: "AOB-obs" }))).status).toBe(404);
    expect((await post(null, "/assessments", body(matchId))).status).toBe(401);
  });
});
