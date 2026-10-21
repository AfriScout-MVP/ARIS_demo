import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login } from "../helpers";

describe("account permissions", async () => {
  await addOfficial("pm-off", "PMA");
  await addUser("pm-ref@aris.test", "referee", { officialId: "pm-off" });
  const seat = await addFederationSeat("PMA");
  const refId = await addUser("pm-ref2@aris.test", "admin");
  await addUser("pm-admin@aris.test", "admin");
  const ref = await login("pm-ref@aris.test");
  const fed = await login(seat.email);
  const admin = await login("pm-admin@aris.test");

  it("is closed to the unauthenticated (401) and to referees (403)", async () => {
    expect((await api("GET", "/api/v1/users")).status).toBe(401);
    expect((await api("GET", "/api/v1/users", { session: ref })).status).toBe(403);
    expect((await api("POST", "/api/v1/users", { session: ref, body: {} })).status).toBe(403);
    expect((await api("PATCH", `/api/v1/users/${refId}`, { session: ref, body: { active: false } })).status).toBe(403);
    expect((await api("POST", `/api/v1/users/${refId}/reset-password`, { session: ref, body: { password: "brand-new-long-password" } })).status).toBe(403);
  });

  it("lets an admin see everyone, with the documented row shape", async () => {
    const res = await api("GET", "/api/v1/users", { session: admin });
    expect(res.status).toBe(200);
    expect(res.json.users.length).toBeGreaterThanOrEqual(4);
    const row = res.json.users.find((u: { email: string }) => u.email === "pm-ref@aris.test");
    expect(Object.keys(row).sort()).toEqual(
      ["active", "country", "createdAt", "email", "federationCode", "federationId", "id", "lastLoginAt", "locale", "name", "officialId", "officialName", "role"].sort(),
    );
    expect(row).toMatchObject({ officialId: "pm-off", officialName: "Official pm-off", country: "PMA", active: true });
    const filtered = await api("GET", "/api/v1/users?role=federation&country=PMA", { session: admin });
    expect(filtered.json.users.map((u: { email: string }) => u.email)).toEqual([seat.email]);
  });

  it("does not let a federation seat touch an admin", async () => {
    expect((await api("PATCH", `/api/v1/users/${refId}`, { session: fed, body: { active: false } })).status).toBe(404);
  });
});
