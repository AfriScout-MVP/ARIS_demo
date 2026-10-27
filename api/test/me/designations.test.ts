import { describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFixture, addOfficial, addUser, api, login, sql } from "../helpers";
import { addPlayedMatch } from "../helpers/evaluation";

describe("my designations and match history", async () => {
  await addCountry("DSA");
  await addCompetition("dsa-d1", "DSA");
  await addOfficial("ds-1", "DSA");
  await addOfficial("ds-2", "DSA");
  await addUser("ds-ref1@aris.test", "referee", { officialId: "ds-1" });
  await addUser("ds-ref2@aris.test", "referee", { officialId: "ds-2" });
  const ref1 = await login("ds-ref1@aris.test");
  const ref2 = await login("ds-ref2@aris.test");
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const states = ["confirmed", "declined", "pending"];
  for (const [i, state] of states.entries()) {
    await addFixture(`ds-fx${i}`, { country: "DSA", competition: "dsa-d1", date: day(5 + i), round: 100 + i, roles: ["R"] });
    await sql("UPDATE designations SET official_id = 'ds-1', state = ? WHERE fixture_id = ?", state, `ds-fx${i}`).run();
  }
  for (let i = 0; i < 5; i++) await addPlayedMatch({ country: "DSA", competition: "dsa-d1", referee: "ds-1" });

  it("lists declined designations too, and filters by state", async () => {
    const all = await api("GET", "/api/v1/me/designations", { session: ref1 });
    expect(all.json.designations.map((d: { state: string }) => d.state)).toEqual(expect.arrayContaining(states));
    const declined = await api("GET", "/api/v1/me/designations?state=declined", { session: ref1 });
    expect(declined.json.designations.map((d: { fixtureId: string }) => d.fixtureId)).toEqual(["ds-fx1"]);
    expect((await api("GET", "/api/v1/me/designations?state=maybe", { session: ref1 })).status).toBe(422);
    expect((await api("GET", "/api/v1/me/designations?state=declined", { session: ref2 })).json.designations).toEqual([]);
  });

  it("pages the match history", async () => {
    const first = await api("GET", "/api/v1/me/history?limit=2", { session: ref1 });
    expect(first.json).toMatchObject({ limit: 2, offset: 0, hasMore: true });
    expect(first.json.matches).toHaveLength(2);
    const last = await api("GET", "/api/v1/me/history?limit=2&offset=4", { session: ref1 });
    expect(last.json.hasMore).toBe(false);
    expect(last.json.matches).toHaveLength(1);
    const ids = new Set([...first.json.matches, ...(await api("GET", "/api/v1/me/history?limit=2&offset=2", { session: ref1 })).json.matches, ...last.json.matches].map((m: { id: string }) => m.id));
    expect(ids.size).toBe(5);
    expect((await api("GET", "/api/v1/me/history?limit=500", { session: ref1 })).status).toBe(422);
    expect((await api("GET", "/api/v1/me/history", { session: ref2 })).json.matches).toEqual([]);
  });
});
