import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { MARKS, addPlayedMatch, get, makeWorld, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("ACA", "ACB");
});

async function filed(country = "ACA", competition = "ACA-d1", referee = "ACA-ref1", observerId = "ACA-obs") {
  const { matchId } = await addPlayedMatch({ country, competition, referee });
  const seat = country === "ACA" ? w.seatA : w.seatB;
  const res = await post(seat, "/assessments", { matchId, observerId, marks: MARKS, notes: { fr: "x", en: "x" } });
  expect(res.status).toBe(201);
  return { matchId, id: res.json.assessment.id as string };
}
const visibleTo = async (s: Parameters<typeof get>[0], matchId: string) => (await get(s, "/assessments")).json.assessments.filter((a: { matchId: string }) => a.matchId === matchId);

describe("confidentiality of a filed report", () => {
  it("is invisible to the assessed referee until staff publish it, and never to another referee", async () => {
    const { matchId, id } = await filed();
    expect(await visibleTo(w.refA1, matchId)).toHaveLength(0);
    expect(await visibleTo(w.refA2, matchId)).toHaveLength(0);
    expect((await post(w.seatA, `/assessments/${id}/publish`)).json.changed).toBe(true);
    expect((await post(w.seatA, `/assessments/${id}/publish`)).json.changed).toBe(false);
    expect(await visibleTo(w.refA1, matchId)).toHaveLength(1);
    expect(await visibleTo(w.refA2, matchId)).toHaveLength(0);
    expect(await visibleTo(w.refB1, matchId)).toHaveLength(0);
  });

  it("notifies the referee in their language when it is released", async () => {
    const { id } = await filed();
    await post(w.seatA, `/assessments/${id}/publish`);
    const n = (await get(w.refA1, "/notifications")).json.notifications.find((x: { title: { en: string } }) => x.title.en === "A match assessment is available");
    expect(n).toBeTruthy();
  });

  it("does not release a draft", async () => {
    const { matchId } = await addPlayedMatch({ country: "ACA", competition: "ACA-d1", referee: "ACA-ref1" });
    const draft = await post(w.seatA, "/assessments", { matchId, observerId: "ACA-obs", marks: { positioning: 5 }, state: "draft" });
    expect((await post(w.seatA, `/assessments/${draft.json.assessment.id}/publish`)).json.error.code).toBe("not_filed");
  });

  it("is a record once filed: only staff correct it, and with a reason", async () => {
    const { id } = await filed();
    expect((await patch(w.seatA, `/assessments/${id}`, { marks: { ...MARKS, fitness: 1 } })).json.error.code).toBe("reason_required");
    const ok = await patch(w.seatA, `/assessments/${id}`, { marks: { ...MARKS, fitness: 1 }, reason: "Typing error" });
    expect(ok.status).toBe(200);
    expect(ok.json.assessment.overall).toBeCloseTo(7.2, 1);
    const log = await sql("SELECT reason, country_code FROM audit_log WHERE entity = 'assessment' AND entity_id = ? AND action = 'assessment.edit'", id).first<{ reason: string; country_code: string }>();
    expect(log).toEqual({ reason: "Typing error", country_code: "ACA" });
  });

  it("answers 401 / 403 / 404 on publish and correction", async () => {
    const { id } = await filed();
    expect((await post(null, `/assessments/${id}/publish`)).status).toBe(401);
    expect((await post(w.refA1, `/assessments/${id}/publish`)).status).toBe(403);
    expect((await post(w.obsA, `/assessments/${id}/publish`)).status).toBe(403);
    // another country's seat: the report does not exist for it, and nothing changes
    expect((await post(w.seatB, `/assessments/${id}/publish`)).status).toBe(404);
    expect((await patch(w.seatB, `/assessments/${id}`, { reason: "meddling", marks: MARKS })).status).toBe(404);
    expect((await patch(w.refA1, `/assessments/${id}`, { reason: "meddling" })).status).toBe(404);
    expect((await sql("SELECT published FROM assessments WHERE id = ?", id).first<{ published: number }>())!.published).toBe(0);
    expect((await post(w.seatA, "/assessments/nope/publish")).status).toBe(404);
  });

  it("keeps a foreign country's reports out of the lists a federation reads", async () => {
    const { matchId } = await filed("ACB", "ACB-d1", "ACB-ref1", "ACB-obs");
    expect(await visibleTo(w.seatA, matchId)).toHaveLength(0);
    expect(await visibleTo(w.seatB, matchId)).toHaveLength(1);
    expect(await visibleTo(w.admin, matchId)).toHaveLength(1);
  });
});
