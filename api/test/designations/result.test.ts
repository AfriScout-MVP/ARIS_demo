import { beforeAll, describe, expect, it } from "vitest";
import { addOfficial, sql, uid } from "../helpers";
import { fixture, get, nextDate, post, put, world, type World } from "./support";

let w: World;
beforeAll(async () => {
  w = await world();
  await addOfficial("res-ref", "EGY");
});

const past = (n: number) => new Date(Date.UTC(2020, 0, 1 + n * 7)).toISOString().slice(0, 10);
let n = 0;

async function pastFixture(roles = ["R"]) {
  const id = uid("fx");
  await fixture(id, { country: "EGY", competition: "egy-d1", date: past(++n), roles });
  return id;
}

describe("POST /fixtures/:id/result", () => {
  it("records the played match in the AfriScout-shaped matches table", async () => {
    const id = await pastFixture();
    await put(w.egy, id, "R", { officialId: "res-ref", state: "confirmed" });
    const res = await post(w.egy, `/fixtures/${id}/result`, { score: "2-1", attendance: 12000 });
    expect(res.status).toBe(201);
    expect(res.json.matchId).toBe(`m-${id}`);
    expect(res.json.fixture).toMatchObject({ status: "played", played: true });

    const m = await sql("SELECT * FROM matches WHERE id = ?", res.json.matchId).first<Record<string, unknown>>();
    expect(m).toMatchObject({ league_id: "egy-d1", season: "2026/2027", home_score: 2, away_score: 1, status: "finished", score_source: "official", referee_id: "res-ref", referee: "Official res-ref", fixture_id: id, attendance: 12000 });
    expect(String(m!.match_date)).toMatch(/^20\d\d-\d\d-\d\dT18:00:00Z$/);
    expect(await sql("SELECT arps_for_match FROM match_officiating WHERE match_id = ?", res.json.matchId).first()).toEqual({ arps_for_match: 0 });
    expect((await sql("SELECT matches FROM officials WHERE id = 'res-ref'").first<{ matches: number }>())!.matches).toBe(1);
  });

  it("accepts numeric scores, and refuses a second result", async () => {
    const id = await pastFixture();
    await put(w.egy, id, "R", { officialId: "res-ref" });
    expect((await post(w.egy, `/fixtures/${id}/result`, { homeScore: 0, awayScore: 0 })).status).toBe(201);
    const again = await post(w.egy, `/fixtures/${id}/result`, { score: "1-0" });
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("match_played");
    expect((await post(w.egy, `/fixtures/${id}/designations/R/respond`, { response: "accept" })).status).toBe(409);
  });

  it("validates the score and needs a referee on record and a match that has been played", async () => {
    const id = await pastFixture();
    expect((await post(w.egy, `/fixtures/${id}/result`, {})).status).toBe(422);
    expect((await post(w.egy, `/fixtures/${id}/result`, { score: "abc" })).status).toBe(422);
    expect((await post(w.egy, `/fixtures/${id}/result`, { score: "1-0" })).json.error.code).toBe("no_referee");
    const future = uid("fx");
    await fixture(future, { country: "EGY", competition: "egy-d1", date: nextDate() });
    await put(w.egy, future, "R", { officialId: "res-ref" });
    expect((await post(w.egy, `/fixtures/${future}/result`, { score: "1-0" })).json.error.code).toBe("not_yet_played");
    expect(await sql("SELECT COUNT(*) AS n FROM matches WHERE fixture_id IN (?, ?)", id, future).first()).toEqual({ n: 0 });
  });

  it("is one match per teams per day: a clash rolls everything back", async () => {
    const a = await pastFixture();
    await put(w.egy, a, "R", { officialId: "res-ref" });
    // same teams, same day, other round
    const b = uid("fx");
    const date = (await sql("SELECT date FROM fixtures WHERE id = ?", a).first<{ date: string }>())!.date;
    await fixture(b, { country: "EGY", competition: "egy-d1", date, roles: ["R"] });
    await sql("INSERT INTO matches (id, home_team_id, away_team_id, match_date) SELECT 'clash-' || ?, home_team_id, away_team_id, kickoff_at FROM fixtures WHERE id = ?", a, a).run();
    const res = await post(w.egy, `/fixtures/${a}/result`, { score: "1-1" });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("duplicate_match");
    expect((await sql("SELECT status FROM fixtures WHERE id = ?", a).first<{ status: string }>())!.status).toBe("scheduled");
  });

  it("is 401 / 403 / 404 for the wrong caller and writes nothing", async () => {
    const id = await pastFixture();
    await put(w.egy, id, "R", { officialId: "res-ref" });
    expect((await post(null, `/fixtures/${id}/result`, { score: "1-0" })).status).toBe(401);
    expect((await post(w.referee, `/fixtures/${id}/result`, { score: "1-0" })).status).toBe(403);
    expect((await post(w.mar, `/fixtures/${id}/result`, { score: "1-0" })).status).toBe(404);
    expect(await sql("SELECT COUNT(*) AS n FROM matches WHERE fixture_id = ?", id).first()).toEqual({ n: 0 });
    expect((await get(w.egy, `/fixtures/${id}`)).json.fixture.status).toBe("scheduled");
  });
});
