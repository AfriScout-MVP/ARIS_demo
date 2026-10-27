import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, del, get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
let mine: string;
let theirs: string;
const decision = {
  minute: 34,
  eventType: "penalty_decision",
  subEvent: "direct_foul",
  outcome: "given_overturned",
  description: { fr: "Faute dans la surface", en: "Foul in the box" },
  initialCall: "given",
  varReview: true,
  finalCall: "overturned",
  confidence: 88,
};

beforeAll(async () => {
  w = await makeWorld("AMA", "AMB");
  mine = (await addPlayedMatch({ country: "AMA", competition: "AMA-d1", referee: "AMA-ref1" })).matchId;
  theirs = (await addPlayedMatch({ country: "AMB", competition: "AMB-d1", referee: "AMB-ref1" })).matchId;
});

describe("matches and decisions", () => {
  it("serves the AfriScout-shaped match with team names, the 'H–A' score and the decisions", async () => {
    expect((await post(w.seatA, `/matches/${mine}/decisions`, decision)).status).toBe(201);
    const res = await get(w.seatA, `/matches/${mine}`);
    expect(res.status).toBe(200);
    expect(res.json.match).toMatchObject({ id: mine, home: "Home FC", away: "Away FC", score: "2–1", homeScore: 2, awayScore: 1, status: "finished", countryCode: "AMA", season: "2026/2027" });
    expect(res.json.match).toHaveProperty("heatPoints");
    expect(res.json.decisions[0]).toMatchObject({ minute: 34, varReview: true, finalCall: "overturned", description: { fr: "Faute dans la surface", en: "Foul in the box" } });
  });

  it("lists a country's matches in SQL scope, a referee's own, and everything for an admin", async () => {
    const ids = async (s: Parameters<typeof get>[0]) => (await get(s, "/matches")).json.matches.map((m: { id: string }) => m.id);
    expect(await ids(w.seatA)).toContain(mine);
    expect(await ids(w.seatA)).not.toContain(theirs);
    expect(await ids(w.refA1)).toEqual([mine]);
    expect(await ids(w.refA2)).toEqual([]);
    expect(await ids(w.admin)).toEqual(expect.arrayContaining([mine, theirs]));
    expect(await ids(w.seatA)).toHaveLength(1);
    const filtered = (await get(w.admin, "/matches?country=amb")).json.matches.map((m: { id: string }) => m.id);
    expect(filtered).toEqual([theirs]);
  });

  it("scopes a tagger to its own country, same as a federation seat", async () => {
    const ids = async (s: Parameters<typeof get>[0]) => (await get(s, "/matches")).json.matches.map((m: { id: string }) => m.id);
    expect(await ids(w.taggerA)).toEqual([mine]);
    expect(await ids(w.taggerB)).toEqual([theirs]);
    expect((await get(w.taggerB, `/matches/${mine}`)).status).toBe(404);
    expect((await post(w.taggerB, `/matches/${mine}/decisions`, decision)).status).toBe(404);
  });

  it("lets a tagger log and remove a decision on its own country's match, tagged_by itself", async () => {
    const res = await post(w.taggerA, `/matches/${mine}/decisions`, { ...decision, minute: 12 });
    expect(res.status).toBe(201);
    const row = await sql("SELECT tagged_by AS taggedBy FROM match_decisions WHERE id = ?", res.json.id).first<{ taggedBy: string }>();
    expect(row!.taggedBy).toBe(w.taggerA.user.id);
    expect((await del(w.taggerA, `/matches/${mine}/decisions/${res.json.id}`)).status).toBe(200);
  });

  it("validates a decision (Localized description, minute range, event taxonomy)", async () => {
    expect((await post(w.seatA, `/matches/${mine}/decisions`, { ...decision, description: { en: "only english" } })).status).toBe(422);
    expect((await post(w.seatA, `/matches/${mine}/decisions`, { ...decision, minute: 200 })).status).toBe(422);
    expect((await post(w.seatA, `/matches/${mine}/decisions`, { ...decision, eventType: "not_a_real_type" })).status).toBe(422);
    // a sub-event that does not belong to this event type is rejected by resolveEventFlow, not just the DB enum
    expect((await post(w.seatA, `/matches/${mine}/decisions`, { ...decision, subEvent: "goal_line_technology" })).status).toBe(422);
  });

  it("answers 401, 403 and the cross-country 404 with no side effect", async () => {
    expect((await get(null, `/matches/${mine}`)).status).toBe(401);
    expect((await post(null, `/matches/${mine}/decisions`, decision)).status).toBe(401);
    expect((await post(w.refA1, `/matches/${mine}/decisions`, decision)).status).toBe(403);
    expect((await get(w.refA2, `/matches/${mine}`)).status).toBe(404);
    expect((await get(w.seatA, `/matches/${theirs}`)).status).toBe(404);
    expect((await post(w.seatA, `/matches/${theirs}/decisions`, decision)).status).toBe(404);
    expect((await post(w.seatA, "/matches/nope/decisions", decision)).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM match_decisions WHERE match_id = ?", theirs).first<{ n: number }>())!.n).toBe(0);
  });

  it("removes a decision logged by mistake, in scope only, and audits what it said", async () => {
    const id = (await post(w.seatA, `/matches/${mine}/decisions`, { ...decision, minute: 71, eventType: "offside_call", subEvent: "attacking_phase", outcome: "flagged" })).json.id as string;
    expect((await del(null, `/matches/${mine}/decisions/${id}`)).status).toBe(401);
    expect((await del(w.refA1, `/matches/${mine}/decisions/${id}`)).status).toBe(403);
    expect((await del(w.seatB, `/matches/${mine}/decisions/${id}`)).status).toBe(404);
    expect((await del(w.seatA, `/matches/${mine}/decisions/nope`)).status).toBe(404);
    expect((await del(w.seatA, `/matches/${theirs}/decisions/${id}`)).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM match_decisions WHERE id = ?", id).first<{ n: number }>())!.n).toBe(1);

    expect((await del(w.seatA, `/matches/${mine}/decisions/${id}`)).status).toBe(200);
    expect((await get(w.seatA, `/matches/${mine}`)).json.decisions.map((d: { id: string }) => d.id)).not.toContain(id);
    const audit = await sql("SELECT before AS b FROM audit_log WHERE action = 'decision.remove' AND entity_id = ? ORDER BY id DESC LIMIT 1", mine).first<{ b: string }>();
    expect(JSON.parse(audit!.b)).toMatchObject({ id, minute: 71, type: "offside_call", sub_event: "attacking_phase", outcome: "flagged" });
    expect((await del(w.seatA, `/matches/${mine}/decisions/${id}`)).status).toBe(404);
  });

  it("keeps continental matches away from federations", async () => {
    const { addCompetition } = await import("../helpers");
    await addCompetition("CAF-AM", "CAF", { tier: "continental" });
    const cont = await addPlayedMatch({ country: "CAF", competition: "CAF-AM", referee: "AMA-ref1" });
    expect((await get(w.seatA, `/matches/${cont.matchId}`)).status).toBe(404);
    expect((await get(w.admin, `/matches/${cont.matchId}`)).status).toBe(200);
  });
});
