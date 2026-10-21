import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { MARKS, addPlayedMatch, get, makeWorld, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("AFA", "AFB");
});

const report = (matchId: string, extra: object = {}) => ({ matchId, observerId: "AFA-obs", marks: MARKS, notes: { fr: "Solide.", en: "Solid." }, ...extra });

describe("filing a report", () => {
  it("weights the marks on the grid and stores a Localized note", async () => {
    const { matchId } = await addPlayedMatch({ country: "AFA", competition: "AFA-d1", referee: "AFA-ref1" });
    const res = await post(w.seatA, "/assessments", report(matchId));
    expect(res.status).toBe(201);
    expect(res.json.assessment).toMatchObject({ matchId, refereeId: "AFA-ref1", observerId: "AFA-obs", state: "filed", published: false, countryCode: "AFA" });
    expect(res.json.assessment.overall).toBeCloseTo(8.1, 1);
    expect(res.json.assessment.notes).toEqual({ fr: "Solide.", en: "Solid." });
    expect(res.json.assessment.filedHoursAfter).toBeGreaterThan(0);
  });

  it("lets an admin file for any country and a draft be completed then filed", async () => {
    const { matchId } = await addPlayedMatch({ country: "AFB", competition: "AFB-d1", referee: "AFB-ref1" });
    const draft = await post(w.admin, "/assessments", { ...report(matchId, { observerId: "AFB-obs" }), marks: { positioning: 7 }, state: "draft" });
    expect(draft.status).toBe(201);
    expect(draft.json.assessment).toMatchObject({ state: "draft", filedAt: null });
    const filed = await patch(w.admin, `/assessments/${draft.json.assessment.id}`, { marks: MARKS, file: true });
    expect(filed.status).toBe(200);
    expect(filed.json.assessment.state).toBe("filed");
  });

  it("validates: every criterion marked, known criteria only, observer required and distinct from the referee", async () => {
    const { matchId } = await addPlayedMatch({ country: "AFA", competition: "AFA-d1", referee: "AFA-ref1" });
    expect((await post(w.seatA, "/assessments", { ...report(matchId), marks: { positioning: 8 } })).json.error.code).toBe("marks_incomplete");
    expect((await post(w.seatA, "/assessments", { ...report(matchId), marks: { ...MARKS, charisma: 9 } })).json.error.code).toBe("unknown_criterion");
    expect((await post(w.seatA, "/assessments", { ...report(matchId), marks: { ...MARKS, fitness: 11 } })).status).toBe(422);
    expect((await post(w.seatA, "/assessments", { matchId, marks: MARKS })).json.error.code).toBe("observer_required");
    expect((await post(w.seatA, "/assessments", report(matchId, { observerId: "AFA-ref1" }))).json.error.code).toBe("self_assessment");
    expect((await post(w.seatA, "/assessments", report(matchId, { observerId: "nobody" }))).json.error.code).toBe("unknown_observer");
    expect((await post(w.seatA, "/assessments", report("no-such-match"))).status).toBe(404);
  });

  it("refuses a second report by the same observer on the same match", async () => {
    const { matchId } = await addPlayedMatch({ country: "AFA", competition: "AFA-d1", referee: "AFA-ref1" });
    expect((await post(w.seatA, "/assessments", report(matchId))).status).toBe(201);
    expect((await post(w.seatA, "/assessments", report(matchId))).status).toBe(409);
  });

  it("answers 401 without a session", async () => {
    expect((await post(null, "/assessments", report("x"))).status).toBe(401);
    expect((await get(null, "/assessments")).status).toBe(401);
  });

  it("answers 404 to a federation naming a foreign match or a foreign observer, with no side effects", async () => {
    const foreign = await addPlayedMatch({ country: "AFB", competition: "AFB-d1", referee: "AFB-ref1" });
    expect((await post(w.seatA, "/assessments", report(foreign.matchId))).status).toBe(404);
    expect((await post(w.seatB, "/assessments", { ...report(foreign.matchId), observerId: "AFA-obs" })).json.error.code).toBe("unknown_observer");
    const { n } = (await sql("SELECT COUNT(*) AS n FROM assessments WHERE match_id = ?", foreign.matchId).first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("lists reports only inside the caller's country", async () => {
    const mine = (await get(w.seatA, "/assessments")).json.assessments;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a: { countryCode: string }) => a.countryCode === "AFA")).toBe(true);
    const theirs = (await get(w.seatB, "/assessments")).json.assessments;
    expect(theirs.every((a: { countryCode: string }) => a.countryCode === "AFB")).toBe(true);
    const all = (await get(w.admin, "/assessments")).json.assessments;
    expect(all.length).toBe(mine.length + theirs.length);
  });
});
