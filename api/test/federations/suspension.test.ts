import { describe, expect, it } from "vitest";
import { addFederationSeat, addUser, api, login, PASSWORD } from "../helpers";

describe("suspending a federation", async () => {
  await addUser("susp-admin@aris.test", "admin");
  const seat = await addFederationSeat("SUA");
  const second = await addUser("susp-second@aris.test", "federation", { federationId: seat.federationId });
  const other = await addFederationSeat("SUB");
  const admin = await login("susp-admin@aris.test");
  const patchFed = (id: string, body: object) => api("PATCH", `/api/v1/federations/${id}`, { session: admin, body });

  it("closes every seat at once, and lets them back in when reactivated", async () => {
    const s1 = await login(seat.email);
    const s2 = await login("susp-second@aris.test");
    const unaffected = await login(other.email);
    expect((await api("GET", "/api/v1/auth/me", { session: s1 })).status).toBe(200);

    expect((await patchFed(seat.federationId, { status: "suspended" })).json.federation.status).toBe("suspended");
    expect((await api("GET", "/api/v1/auth/me", { session: s1 })).status).toBe(401);
    expect((await api("GET", "/api/v1/users", { session: s2 })).status).toBe(401);
    expect((await api("POST", "/api/v1/auth/login", { body: { email: seat.email, password: PASSWORD } })).status).toBe(401);
    expect((await api("GET", "/api/v1/auth/me", { session: unaffected })).status).toBe(200);

    expect((await patchFed(seat.federationId, { status: "active" })).status).toBe(200);
    // the very same cookies work again: nothing was revoked, the seats were only closed
    expect((await api("GET", "/api/v1/auth/me", { session: s1 })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: s2 })).status).toBe(200);
    await login(seat.email);
    void second;
  });

  it("is audited as suspend / reactivate under the federation's country", async () => {
    const res = await api("GET", "/api/v1/audit?entity=federation&limit=20", { session: admin });
    const actions = res.json.entries.filter((e: { entityId: string }) => e.entityId === seat.federationId).map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["federation.suspend", "federation.reactivate"]));
  });

  it("is also what deactivating the country does", async () => {
    const s = await login(seat.email);
    expect((await api("PATCH", "/api/v1/countries/SUA", { session: admin, body: { active: false } })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: s })).status).toBe(401);
    expect((await api("PATCH", "/api/v1/countries/SUA", { session: admin, body: { active: true } })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session: s })).status).toBe(200);
  });
});
