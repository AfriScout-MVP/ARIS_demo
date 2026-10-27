import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, uid } from "../helpers";

describe("a password chosen by someone else must be changed first", async () => {
  await addUser("mc-admin@aris.test", "admin");
  const seat = await addFederationSeat("MCA");
  await addOfficial("mc-off", "MCA");
  await addOfficial("mc-off-2", "MCA");
  const admin = await login("mc-admin@aris.test");
  const fed = await login(seat.email);
  const TEMP = "a-temporary-passphrase";

  it("flags staff-created accounts, refuses every route but /auth until the change, and the change clears it", async () => {
    const email = `${uid("mc")}@aris.test`;
    const created = await api("POST", "/api/v1/users", { session: fed, body: { email, name: "New Ref", role: "referee", officialId: "mc-off", password: TEMP } });
    expect(created.status).toBe(201);
    expect(created.json.user.mustChangePassword).toBe(true);

    const s = await login(email, TEMP);
    expect(s.user).toMatchObject({ mustChangePassword: true });
    expect((await api("GET", "/api/v1/auth/me", { session: s })).json.user.mustChangePassword).toBe(true);
    const blocked = await api("GET", "/api/v1/me/designations", { session: s });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe("password_change_required");
    expect((await api("GET", "/api/v1/notifications", { session: s })).status).toBe(403);
    // the account's own settings stay reachable
    expect((await api("PATCH", "/api/v1/auth/me", { session: s, body: { name: "Renamed Ref" } })).status).toBe(200);

    expect((await api("POST", "/api/v1/auth/change-password", { session: s, body: { currentPassword: TEMP, newPassword: "my-very-own-passphrase" } })).status).toBe(200);
    const after = await login(email, "my-very-own-passphrase");
    expect(after.user).toMatchObject({ mustChangePassword: false, name: "Renamed Ref" });
    expect((await api("GET", "/api/v1/me/designations", { session: after })).status).toBe(200);
  });

  it("flags an account whose password an administrator (or its federation) reset", async () => {
    const email = `${uid("mc-r")}@aris.test`;
    const id = await addUser(email, "referee", { officialId: "mc-off-2" });
    expect((await login(email)).user.mustChangePassword).toBe(false);
    expect((await api("POST", `/api/v1/users/${id}/reset-password`, { session: admin, body: { password: TEMP } })).status).toBe(200);
    const s = await login(email, TEMP);
    expect(s.user.mustChangePassword).toBe(true);
    expect((await api("GET", `/api/v1/users/${id}`, { session: admin })).json.user.mustChangePassword).toBe(true);
  });

  it("lets anyone rename themselves, and validates the name", async () => {
    const s = await login(seat.email);
    const res = await api("PATCH", "/api/v1/auth/me", { session: s, body: { name: "  Seat Holder  " } });
    expect(res.status).toBe(200);
    expect(res.json.user.name).toBe("Seat Holder");
    expect((await api("PATCH", "/api/v1/auth/me", { session: s, body: { name: "" } })).status).toBe(422);
    expect((await api("PATCH", "/api/v1/auth/me", { body: { name: "x" } })).status).toBe(401);
  });
});
