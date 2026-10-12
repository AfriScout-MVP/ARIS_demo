import { describe, expect, it } from "vitest";
import { addUser, api, login, PASSWORD, uid } from "./helpers";

describe("health", () => {
  it("answers without signing in", async () => {
    const res = await api("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, database: "ok" });
  });
});

describe("authentication", () => {
  it("signs in, sets an HttpOnly cookie, and identifies the caller", async () => {
    const email = `${uid("a")}@aris.test`;
    await addUser(email, "commission");
    const res = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/aris_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const session = await login(email);
    const me = await api("GET", "/api/v1/auth/me", { session });
    expect(me.json.user).toMatchObject({ email, role: "commission" });
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const email = `${uid("b")}@aris.test`;
    await addUser(email, "commission");
    const wrong = await api("POST", "/api/v1/auth/login", { body: { email, password: "not-the-password-xx" } });
    const unknown = await api("POST", "/api/v1/auth/login", { body: { email: "nobody@aris.test", password: "not-the-password-xx" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json);
  });

  it("locks an account after repeated failures", async () => {
    const email = `${uid("c")}@aris.test`;
    await addUser(email, "commission");
    for (let i = 0; i < 5; i++) await api("POST", "/api/v1/auth/login", { body: { email, password: "wrong-wrong-wrong" } });
    const blocked = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
  });

  it("requires a session for everything under /api/v1", async () => {
    expect((await api("GET", "/api/v1/users")).status).toBe(401);
  });

  it("rejects a forged token and a token for a deactivated account", async () => {
    const forged = await api("GET", "/api/v1/auth/me", { headers: { authorization: "Bearer aaa.bbb.ccc" } });
    expect(forged.status).toBe(401);

    const email = `${uid("d")}@aris.test`;
    const id = await addUser(email, "commission");
    const session = await login(email);
    await (await import("./helpers")).sql("UPDATE users SET active = 0 WHERE id = ?", id).run();
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
  });

  it("refuses state-changing requests from another origin", async () => {
    const res = await api("POST", "/api/v1/auth/logout", { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("cross_origin");
  });

  it("ends every session when the password changes", async () => {
    const email = `${uid("e")}@aris.test`;
    await addUser(email, "commission");
    const session = await login(email);
    const res = await api("POST", "/api/v1/auth/change-password", {
      session,
      body: { currentPassword: PASSWORD, newPassword: "a-much-longer-new-passphrase" },
    });
    expect(res.status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
    await login(email, "a-much-longer-new-passphrase");
  });
});
