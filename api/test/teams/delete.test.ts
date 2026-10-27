import { describe, expect, it } from "vitest";
import { addCompetition, addFederationSeat, addFixture, addOfficial, addStadium, addTeam, addUser, api, login, png, sql, upload } from "../helpers";

describe("deleting teams and stadiums entered by mistake", async () => {
  await addUser("td-admin@aris.test", "admin");
  const seat = await addFederationSeat("TDA");
  const other = await addFederationSeat("TDB");
  await addCompetition("TDA-d1", "TDA");
  const admin = await login("td-admin@aris.test");
  const fed = await login(seat.email);
  const foreign = await login(other.email);
  const del = (s: typeof admin | null, path: string) => api("DELETE", `/api/v1${path}`, { session: s });
  const count = async (q: string, ...a: string[]) => (await sql(q, ...a).first<{ n: number }>())!.n;

  it("removes an unused team, its crest and records who did it", async () => {
    const id = await addTeam("Typo FC", "TDA");
    expect((await upload(fed, "PUT", `/teams/${id}/logo`, png(7))).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM media_assets WHERE owner_type = 'team' AND owner_id = ?", id)).toBe(1);
    expect((await del(fed, `/teams/${id}`)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE id = ?", id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM media_assets WHERE owner_type = 'team' AND owner_id = ?", id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'team.delete' AND entity_id = ? AND country_code = 'TDA'", id)).toBe(1);
    expect((await del(fed, `/teams/${id}`)).status).toBe(404);
  });

  it("keeps a team that has fixtures, and says why", async () => {
    await addFixture("td-fx", { country: "TDA", competition: "TDA-d1", date: "2026-03-01", home: "Real TDA", away: "Union TDA" });
    const home = (await sql("SELECT home_team_id AS id FROM fixtures WHERE id = 'td-fx'").first<{ id: string }>())!.id;
    const res = await del(admin, `/teams/${home}`);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("in_use");
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE id = ?", home)).toBe(1);
  });

  it("removes an unused stadium and clears it as a team's home ground", async () => {
    const st = await addStadium("Stade Fantôme", "Tdaville", "TDA");
    const team = await addTeam("Locataire FC", "TDA");
    await sql("UPDATE teams SET stadium_id = ? WHERE id = ?", st, team).run();
    const res = await del(fed, `/stadiums/${st}`);
    expect(res.status).toBe(200);
    expect(res.json.homeGroundCleared).toBe(1);
    expect((await sql("SELECT stadium_id FROM teams WHERE id = ?", team).first<{ stadium_id: string | null }>())!.stadium_id).toBeNull();
  });

  it("keeps a stadium that fixtures are played at", async () => {
    const st = await addStadium("Stade Utilisé", "Tdaville", "TDA");
    await sql("UPDATE fixtures SET stadium_id = ? WHERE id = 'td-fx'", st).run();
    const res = await del(admin, `/stadiums/${st}`);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatchObject({ code: "in_use" });
  });

  it("answers 404 across countries, 403 to a referee and 401 signed out, deleting nothing", async () => {
    const id = await addTeam("Protégé FC", "TDA");
    const st = await addStadium("Stade Protégé", "Tdaville", "TDA");
    expect((await del(foreign, `/teams/${id}`)).status).toBe(404);
    expect((await del(foreign, `/stadiums/${st}`)).status).toBe(404);
    expect((await del(null, `/teams/${id}`)).status).toBe(401);
    await addOfficial("td-off", "TDA");
    await addUser("td-ref@aris.test", "referee", { officialId: "td-off" });
    const ref = await login("td-ref@aris.test");
    expect((await del(ref, `/teams/${id}`)).status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE id = ?", id)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM stadiums WHERE id = ?", st)).toBe(1);
  });
});
