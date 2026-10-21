import { describe, expect, it } from "vitest";
import { addFederationSeat, addStadium, addTeam, addUser, api, login, png, sql, upload } from "../helpers";

describe("teams and stadiums are confined to the federation's country", async () => {
  await addUser("ts-admin@aris.test", "admin");
  const sa = await addFederationSeat("TSA");
  const sb = await addFederationSeat("TSB");
  const teamB = await addTeam("B United", "TSB");
  const stadiumB = await addStadium("B Arena", "Bville", "TSB");
  await addTeam("A United", "TSA");
  const a = await login(sa.email);
  const admin = await login("ts-admin@aris.test");
  void sb;

  it("lists only its own country, whatever the query says", async () => {
    expect((await api("GET", "/api/v1/teams", { session: a })).json.teams.map((t: { country: string }) => t.country)).toEqual(["TSA"]);
    expect((await api("GET", "/api/v1/teams?country=TSB", { session: a })).json.teams).toEqual([]);
    expect((await api("GET", "/api/v1/stadiums?country=TSB", { session: a })).json.stadiums).toEqual([]);
    const all = (await api("GET", "/api/v1/teams", { session: admin })).json.teams.map((t: { country: string }) => t.country);
    expect(all).toEqual(expect.arrayContaining(["TSA", "TSB"]));
  });

  it("answers 404 and changes nothing for another country's records", async () => {
    expect((await api("PATCH", `/api/v1/teams/${teamB}`, { session: a, body: { name: "Hijacked" } })).status).toBe(404);
    expect((await upload(a, "PUT", `/teams/${teamB}/logo`, png())).status).toBe(404);
    expect((await api("PATCH", `/api/v1/stadiums/${stadiumB}`, { session: a, body: { name: "Hijacked" } })).status).toBe(404);
    expect((await api("POST", "/api/v1/teams", { session: a, body: { name: "Invader FC", kind: "club", country: "TSB" } })).status).toBe(404);
    expect((await api("POST", "/api/v1/stadiums", { session: a, body: { name: "Invader", city: "X", country: "TSB" } })).status).toBe(404);
    expect((await api("POST", "/api/v1/teams", { session: a, body: { name: "Continental", kind: "national", country: "CAF" } })).status).toBe(404);
    expect((await sql("SELECT name FROM teams WHERE id = ?", teamB).first<{ name: string }>())!.name).toBe("B United");
    expect((await sql("SELECT name FROM stadiums WHERE id = ?", stadiumB).first<{ name: string }>())!.name).toBe("B Arena");
    expect((await sql("SELECT COUNT(*) AS n FROM teams WHERE name = 'Invader FC'").first<{ n: number }>())!.n).toBe(0);
    expect((await sql("SELECT COUNT(*) AS n FROM media_assets WHERE owner_id = ?", teamB).first<{ n: number }>())!.n).toBe(0);
    // a missing record looks the same
    expect((await api("PATCH", "/api/v1/teams/ghost", { session: a, body: { name: "Ghost FC" } })).status).toBe(404);
  });

  it("lets an admin work in any country", async () => {
    expect((await api("PATCH", `/api/v1/teams/${teamB}`, { session: admin, body: { shortName: "BU" } })).json.team.shortName).toBe("BU");
    expect((await api("PATCH", `/api/v1/stadiums/${stadiumB}`, { session: admin, body: { capacity: 5000 } })).status).toBe(200);
  });
});
