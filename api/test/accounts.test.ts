import { describe, expect, it } from "vitest";
import { addUser, api, login } from "./helpers";

describe("administrator safety", () => {
  it("never leaves the platform without an active administrator", async () => {
    const aId = await addUser("root-a@aris.test", "admin");
    const bId = await addUser("root-b@aris.test", "admin");
    const a = await login("root-a@aris.test");

    // with two admins, one can be deactivated…
    const first = await api("PATCH", `/api/v1/users/${bId}`, { session: a, body: { active: false } });
    expect(first.status).toBe(200);
    // …but the last one cannot, neither by deactivation nor by demotion
    const deactivate = await api("PATCH", `/api/v1/users/${aId}`, { session: a, body: { active: false } });
    expect(deactivate.status).toBe(409);
    expect(deactivate.json.error.code).toBe("last_admin");
    const demote = await api("PATCH", `/api/v1/users/${aId}`, { session: a, body: { role: "commission" } });
    expect(demote.status).toBe(409);
  });

  it("signs a user out everywhere the moment their role or status changes", async () => {
    await addUser("boss@aris.test", "admin");
    const targetId = await addUser("demoted@aris.test", "commission");
    const boss = await login("boss@aris.test");
    const target = await login("demoted@aris.test");
    expect((await api("GET", "/api/v1/auth/me", { session: target })).status).toBe(200);
    await api("PATCH", `/api/v1/users/${targetId}`, { session: boss, body: { role: "observer" } });
    expect((await api("GET", "/api/v1/auth/me", { session: target })).status).toBe(401);
  });
});
