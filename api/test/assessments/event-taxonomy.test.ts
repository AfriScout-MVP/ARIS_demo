import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, type World } from "../helpers/evaluation";

let w: World;
let matchId: string;

beforeAll(async () => {
  w = await makeWorld("AMC", "AMD");
  matchId = (await addPlayedMatch({ country: "AMC", competition: "AMC-d1", referee: "AMC-ref1" })).matchId;
});

describe("the referee-decision taxonomy", () => {
  it("is served to every authenticated role, and refused to a signed-out caller", async () => {
    expect((await get(null, "/matches/event-types")).status).toBe(401);
    for (const session of [w.admin, w.seatA, w.taggerA, w.refA1]) {
      const res = await get(session, "/matches/event-types");
      expect(res.status).toBe(200);
      expect(res.json.eventTypes.length).toBeGreaterThan(0);
      expect(res.json.eventTypes[0]).toMatchObject({ key: expect.any(String), labelFr: expect.any(String), labelEn: expect.any(String), subEvents: expect.any(Array) });
    }
  });

  it("enforces the top-level event_type vocabulary at the database level", async () => {
    await expect(
      sql(
        `INSERT INTO match_decisions (id, match_id, minute, type, description, initial_call, var_review, final_call, confidence, pressure_index, distance, players)
         VALUES ('bad-type', ?, 10, 'not_a_real_type', '{}', 'given', 0, 'confirmed', 0, 0, 0, '[]')`,
        matchId,
      ).run(),
    ).rejects.toThrow();
  });

  it("tolerates a pre-migration row with no sub_event/outcome when mapped back to the API shape", async () => {
    const { toDecision } = await import("../../src/domain/matches");
    const legacy = toDecision({
      id: "legacy-1",
      match_id: "m-legacy",
      minute: 5,
      type: "card",
      sub_event: null,
      outcome: null,
      description: "{}",
      initial_call: "given",
      var_review: 0,
      final_call: "confirmed",
      confidence: 0,
      pressure_index: 0,
      distance: 0,
      players: "[]",
      tagged_by: null,
    });
    expect(legacy).toMatchObject({ id: "legacy-1", eventType: "card", subEvent: null, outcome: null });
  });
});
