import { describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFederationSeat, addFixture, addOfficial, addStadium, addUser, api, login, sql } from "../helpers";

describe("the referee's personal space", async () => {
  await addCountry("MEA", { timezone: "Africa/Nairobi" });
  await addUser("me-admin@aris.test", "admin");
  const seat = await addFederationSeat("MEA");
  await addCompetition("mea-d1", "MEA");
  await addOfficial("me-1", "MEA");
  await addOfficial("me-2", "MEA");
  await addUser("me-ref1@aris.test", "referee", { officialId: "me-1" });
  await addUser("me-ref2@aris.test", "referee", { officialId: "me-2" });
  const ref = await login("me-ref1@aris.test");
  const ref2 = await login("me-ref2@aris.test");
  const admin = await login("me-admin@aris.test");
  const fed = await login(seat.email);

  const stadium = await addStadium("Meastade", "Meaville", "MEA");
  await addFixture("me-fx1", { country: "MEA", competition: "mea-d1", date: "2036-01-10", time: "22:30", roles: ["R"], home: "Home MEA", away: "Away MEA" });
  await sql("UPDATE fixtures SET stadium_id = ? WHERE id = 'me-fx1'", stadium).run();
  await sql("UPDATE designations SET official_id = 'me-1', state = 'pending' WHERE fixture_id = 'me-fx1'").run();
  await addFixture("me-fx0", { country: "MEA", competition: "mea-d1", date: "2020-01-10", time: "15:00", roles: ["R"], home: "Old Home", away: "Old Away", round: 2 });
  await sql("UPDATE designations SET official_id = 'me-1', state = 'confirmed' WHERE fixture_id = 'me-fx0'").run();
  await sql(
    `INSERT INTO matches (id, league_id, season, matchday, home_team_id, away_team_id, match_date, home_score, away_score, status, fixture_id, referee_id)
     SELECT 'me-m0', 'mea-d1', '2026/2027', '2', home_team_id, away_team_id, kickoff_at, 2, 1, 'finished', id, 'me-1' FROM fixtures WHERE id = 'me-fx0'`,
  ).run();

  it("shows what is waiting for the referee", async () => {
    const res = await api("GET", "/api/v1/me", { session: ref });
    expect(res.status).toBe(200);
    expect(res.json.official.id).toBe("me-1");
    expect(res.json).toMatchObject({ awaitingResponse: 1, upcomingDesignations: 1 }); // me-fx1 is in the future and pending; me-fx0 is long past
    expect(res.json).toHaveProperty("unreadNotifications");
    expect(res.json.user).toMatchObject({ role: "referee", officialId: "me-1" });
  });

  it("lists designations with team names, the venue and the LOCAL date and time", async () => {
    const res = await api("GET", "/api/v1/me/designations?from=2036-01-01&to=2036-01-31", { session: ref });
    expect(res.json.designations).toHaveLength(1);
    expect(res.json.designations[0]).toMatchObject({
      fixtureId: "me-fx1", role: "R", state: "pending", home: "Home MEA", away: "Away MEA", venue: "Meastade", city: "Meaville",
      date: "2036-01-11", kickoff: "01:30", kickoffAt: "2036-01-10T22:30:00Z", played: false, competition: "League mea-d1",
    });
    expect((await api("GET", "/api/v1/me/designations?from=2036-01-01&to=2036-01-10", { session: ref })).json.designations).toEqual([]);
    expect((await api("GET", "/api/v1/me/designations?from=2036-01-01&to=2036-01-31", { session: ref2 })).json.designations).toEqual([]);
    expect((await api("GET", "/api/v1/me/designations?from=bad", { session: ref })).status).toBe(422);
  });

  it("lists the matches they officiated, with scores and local time", async () => {
    const res = await api("GET", "/api/v1/me/history", { session: ref });
    expect(res.json.matches).toHaveLength(1);
    expect(res.json.matches[0]).toMatchObject({ id: "me-m0", home: "Old Home", away: "Old Away", score: "2–1", homeScore: 2, awayScore: 1, role: "R", date: "2020-01-10", kickoff: "18:00" });
    expect((await api("GET", "/api/v1/me/history", { session: ref2 })).json.matches).toEqual([]);
  });

  it("is for accounts linked to an official only", async () => {
    for (const p of ["/me", "/me/designations", "/me/history"]) {
      expect((await api("GET", `/api/v1${p}`, { session: admin })).status, p).toBe(403);
      expect((await api("GET", `/api/v1${p}`, { session: fed })).status, p).toBe(403);
      expect((await api("GET", `/api/v1${p}`)).status, p).toBe(401);
    }
  });
});
