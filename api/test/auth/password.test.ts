import { describe, expect, it } from "vitest";
import { addUser, api, login, PASSWORD, uid } from "../helpers";

describe("passwords", () => {
  it("ends every session when the password changes, and the new one works", async () => {
    const email = `${uid("e")}@aris.test`;
    await addUser(email, "admin");
    const session = await login(email);
    const res = await api("POST", "/api/v1/auth/change-password", { session, body: { currentPassword: PASSWORD, newPassword: "a-much-longer-new-passphrase" } });
    expect(res.status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
    await login(email, "a-much-longer-new-passphrase");
  });

  it("needs the current password", async () => {
    const email = `${uid("f")}@aris.test`;
    await addUser(email, "admin");
    const session = await login(email);
    const res = await api("POST", "/api/v1/auth/change-password", { session, body: { currentPassword: "not-my-password-1", newPassword: "a-much-longer-new-passphrase" } });
    expect(res.status).toBe(401);
  });

  it("enforces the length policy (12+) on change and on account creation", async () => {
    const email = `${uid("g")}@aris.test`;
    await addUser(email, "admin");
    const session = await login(email);
    expect((await api("POST", "/api/v1/auth/change-password", { session, body: { currentPassword: PASSWORD, newPassword: "short" } })).status).toBe(422);
    const create = await api("POST", "/api/v1/users", { session, body: { email: `${uid("w")}@aris.test`, name: "W", role: "admin", password: "elevenchars" } });
    expect(create.status).toBe(422);
    expect(create.json.error.code).toBe("validation_failed");
  });

  it("requires a session", async () => {
    expect((await api("POST", "/api/v1/auth/change-password", { body: { currentPassword: PASSWORD, newPassword: "a-much-longer-new-passphrase" } })).status).toBe(401);
  });
});
