import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, put, type World } from "../helpers/evaluation";

let w: World;
let mine: string;
let theirs: string;
beforeAll(async () => {
  w = await makeWorld("PSA", "PSB");
  mine = (await addPlayedMatch({ country: "PSA", competition: "PSA-d1", referee: "PSA-ref1" })).matchId;
  theirs = (await addPlayedMatch({ country: "PSB", competition: "PSB-d1", referee: "PSB-ref1" })).matchId;
});

const path = (matchId: string, officialId: string) => `/matches/${matchId}/officiating/${officialId}`;
const BODY = {
  heatPoints: [
    { x: 52.5, y: 34, intensity: 0.9 },
    { x: 0, y: 0, intensity: 0 },
    { x: 105, y: 68, intensity: 1 },
  ],
  physical: { distanceKm: 10.4, sprints: 38, topSpeed: 27.1, avgDistanceToBall: 17.5, diagonalAdherence: 82 },
  pressureTimeline: [
    { minute: 45, pressure: 70 },
    { minute: 15, pressure: 30 },
  ],
  weather: { condition: "Light rain", temperatureC: 24, humidity: 81 },
};
const row = (matchId: string) => sql("SELECT physical, pressure_timeline, heat_points, pressure_avg, rmcs, arps_for_match FROM match_officiating WHERE match_id = ?", matchId).first<Record<string, any>>();

describe("PUT /matches/:id/officiating/:officialId", () => {
  it("records the referee's positioning, physical load, pressure and weather, and audits it", async () => {
    const res = await put(w.seatA, path(mine, "PSA-ref1"), BODY);
    expect(res.status).toBe(200);
    expect(res.json.match).toMatchObject({
      id: mine,
      heatPoints: BODY.heatPoints,
      physical: BODY.physical,
      // stored in minute order; the match's average pressure follows the timeline
      pressureTimeline: [{ minute: 15, pressure: 30 }, { minute: 45, pressure: 70 }],
      pressureAvg: 50,
      weather: BODY.weather,
    });
    const r = (await row(mine))!;
    expect(JSON.parse(r.heat_points)).toHaveLength(3);
    // the analytics feed's and the observer's figures are left alone
    expect(r).toMatchObject({ rmcs: 0, arps_for_match: 0 });
    const log = await sql("SELECT country_code, after FROM audit_log WHERE action = 'match.positioning' AND entity_id = ?", mine).first<{ country_code: string; after: string }>();
    expect(log!.country_code).toBe("PSA");
    expect(JSON.parse(log!.after)).toMatchObject({ heatPoints: 3, pressureTimeline: 2 });

    // the staff snapshot and the match read carry it
    const one = await get(w.seatA, `/matches/${mine}`);
    expect(one.json.match.heatPoints).toEqual(BODY.heatPoints);
    expect(one.json.match.weather).toEqual(BODY.weather);
  });

  it("changes only what is sent; weather can be cleared", async () => {
    const res = await put(w.admin, path(mine, "PSA-ref1"), { weather: null });
    expect(res.status).toBe(200);
    expect(res.json.match.weather).toBeNull();
    expect(res.json.match.heatPoints).toHaveLength(3);
    expect(res.json.match.physical).toEqual(BODY.physical);
  });

  it("creates the analytics row when the match has none yet", async () => {
    const { matchId } = await addPlayedMatch({ country: "PSA", competition: "PSA-d1", referee: "PSA-ref2" });
    await sql("DELETE FROM match_officiating WHERE match_id = ?", matchId).run();
    const res = await put(w.seatA, path(matchId, "PSA-ref2"), { heatPoints: [{ x: 10, y: 10, intensity: 0.4 }] });
    expect(res.status).toBe(200);
    expect(await row(matchId)).toMatchObject({ heat_points: '[{"x":10,"y":10,"intensity":0.4}]', physical: "{}", pressure_timeline: "[]", pressure_avg: 0 });
  });

  it("rejects points off the pitch, out-of-range values, oversized arrays and unknown fields", async () => {
    const bad = [
      { heatPoints: [{ x: 106, y: 10, intensity: 0.5 }] },
      { heatPoints: [{ x: 10, y: 69, intensity: 0.5 }] },
      { heatPoints: [{ x: -1, y: 10, intensity: 0.5 }] },
      { heatPoints: [{ x: 10, y: 10, intensity: 1.5 }] },
      { heatPoints: Array.from({ length: 1501 }, () => ({ x: 1, y: 1, intensity: 0.1 })) },
      { physical: { ...BODY.physical, diagonalAdherence: 140 } },
      { physical: { distanceKm: 10 } },
      { pressureTimeline: [{ minute: 10, pressure: 101 }] },
      { pressureTimeline: [{ minute: 10, pressure: 1 }, { minute: 10, pressure: 2 }] },
      { weather: { condition: "<script>alert(1)</script>" } },
      { arpsForMatch: 99 },
      {},
    ];
    for (const body of bad) expect((await put(w.seatA, path(mine, "PSA-ref1"), body)).status, JSON.stringify(body).slice(0, 80)).toBe(422);
    expect(JSON.parse((await row(mine))!.heat_points)).toHaveLength(3);
  });

  it("only describes the match's referee", async () => {
    const res = await put(w.seatA, path(mine, "PSA-ref2"), BODY);
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("not_the_referee");
  });

  it("answers 401 signed out and 403 to a referee, even the match's own", async () => {
    expect((await put(null, path(mine, "PSA-ref1"), BODY)).status).toBe(401);
    expect((await put(w.refA1, path(mine, "PSA-ref1"), BODY)).status).toBe(403);
  });

  it("does not cross countries: a foreign match is 404 and stays untouched", async () => {
    const before = await row(theirs);
    const res = await put(w.seatA, path(theirs, "PSB-ref1"), BODY);
    expect(res.status).toBe(404);
    expect(await row(theirs)).toEqual(before);
    expect((await put(w.seatA, path("no-such-match", "PSB-ref1"), BODY)).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'match.positioning' AND entity_id = ?", theirs).first<{ n: number }>())!.n).toBe(0);
    // its own federation and the admin may
    expect((await put(w.seatB, path(theirs, "PSB-ref1"), { heatPoints: [] })).status).toBe(200);
  });
});
