import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addStadium, addUser, api, login, png, sql, upload } from "../helpers";

describe("teams", async () => {
  await addUser("tm-admin@aris.test", "admin");
  const seat = await addFederationSeat("TMA");
  await addFederationSeat("TMB");
  await addOfficial("tm-off", "TMA");
  await addUser("tm-ref@aris.test", "referee", { officialId: "tm-off" });
  const stadiumA = await addStadium("Grand Stade", "Tmaville", "TMA");
  const admin = await login("tm-admin@aris.test");
  const fed = await login(seat.email);
  const ref = await login("tm-ref@aris.test");
  const post = (s: typeof admin | null, body: object) => api("POST", "/api/v1/teams", { session: s, body });

  it("creates, lists, filters and patches a team", async () => {
    const res = await post(fed, { name: "Étoile FC", shortName: "EFC", kind: "club", country: "TMA", city: "Tmaville", stadiumId: stadiumA });
    expect(res.status).toBe(201);
    expect(res.json.team).toMatchObject({ name: "Étoile FC", shortName: "EFC", kind: "club", country: "TMA", city: "Tmaville", stadiumId: stadiumA, stadiumName: "Grand Stade", logoUrl: null });
    const id = res.json.team.id as string;
    expect((await post(fed, { name: "TMA", kind: "national", country: "TMA" })).status).toBe(201);

    const list = (await api("GET", "/api/v1/teams?country=TMA", { session: fed })).json.teams as Array<{ id: string; kind: string }>;
    expect(list).toHaveLength(2);
    expect((await api("GET", "/api/v1/teams?kind=national", { session: fed })).json.teams).toHaveLength(1);

    const patched = await api("PATCH", `/api/v1/teams/${id}`, { session: fed, body: { name: "Étoile Sportive", city: null, stadiumId: null } });
    expect(patched.status).toBe(200);
    expect(patched.json.team).toMatchObject({ name: "Étoile Sportive", city: null, stadiumId: null });
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'team' AND entity_id = ? AND country_code = 'TMA'", id).first<{ n: number }>())!.n).toBe(2);
  });

  it("enforces (name, country, kind) uniqueness with 409 team_exists", async () => {
    expect((await post(admin, { name: "Dup FC", kind: "club", country: "TMA" })).status).toBe(201);
    const dup = await post(admin, { name: "dup fc", kind: "club", country: "TMA" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("team_exists");
    expect((await post(admin, { name: "Dup FC", kind: "national", country: "TMA" })).status).toBe(201); // other kind: fine
    expect((await post(admin, { name: "Dup FC", kind: "club", country: "TMB" })).status).toBe(201); // other country: fine
    const other = (await post(admin, { name: "Other FC", kind: "club", country: "TMA" })).json.team.id;
    expect((await api("PATCH", `/api/v1/teams/${other}`, { session: admin, body: { name: "Dup FC" } })).status).toBe(409);
  });

  it("validates input and the home ground", async () => {
    expect((await post(fed, { name: "X", kind: "club", country: "TMA" })).status).toBe(422);
    expect((await post(fed, { name: "Valid FC", kind: "robot", country: "TMA" })).status).toBe(422);
    const foreignGround = await addStadium("Other Ground", "Tmbville", "TMB");
    expect((await post(fed, { name: "Ground FC", kind: "club", country: "TMA", stadiumId: foreignGround })).json.error.code).toBe("unknown_stadium");
    expect((await post(admin, { name: "Ghost FC", kind: "club", country: "ZZZ" })).json.error.code).toBe("unknown_country");
    expect((await api("PATCH", "/api/v1/teams/nope", { session: admin, body: { name: "Nothing" } })).status).toBe(404);
    expect((await api("PATCH", `/api/v1/teams/nope`, { session: admin, body: {} })).status).toBe(422);
  });

  it("is closed to referees (403) and to the unauthenticated (401)", async () => {
    expect((await api("GET", "/api/v1/teams", { session: ref })).status).toBe(403);
    expect((await post(ref, { name: "Ref FC", kind: "club", country: "TMA" })).status).toBe(403);
    expect((await api("GET", "/api/v1/teams")).status).toBe(401);
    expect((await post(null, { name: "Anon FC", kind: "club", country: "TMA" })).status).toBe(401);
  });

  it("uploads a public crest and replaces it", async () => {
    const id = (await post(fed, { name: "Crest FC", kind: "club", country: "TMA" })).json.team.id as string;
    const up = await upload(fed, "PUT", `/teams/${id}/logo`, png(3), "crest.png");
    expect(up.status).toBe(200);
    const url = up.json.team.logoUrl as string;
    expect((await api("GET", url)).status).toBe(200); // public
    const again = await upload(fed, "PUT", `/teams/${id}/logo`, png(4), "crest2.png");
    expect(again.json.team.logoUrl).not.toBe(url);
    expect((await sql("SELECT COUNT(*) AS n FROM media_assets WHERE owner_type = 'team' AND owner_id = ?", id).first<{ n: number }>())!.n).toBe(1);
    expect((await sql("SELECT kind, visibility FROM media_assets WHERE owner_id = ?", id).first<Record<string, string>>())).toEqual({ kind: "crest", visibility: "public" });
  });
});
