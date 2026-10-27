import { describe, expect, it } from "vitest";
import { addFederationSeat, addUser, api, login, PASSWORD, uid } from "../helpers";

describe("health", () => {
  it("answers without signing in", async () => {
    const res = await api("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, database: "ok" });
  });

  it("reveals nothing about the deployment", async () => {
    const res = await api("GET", "/api/health");
    expect(Object.keys(res.json).sort()).toEqual(["database", "ok", "service"]);
  });
});

describe("login", () => {
  it("signs in, sets an HttpOnly SameSite=Lax cookie and identifies the caller", async () => {
    const email = `${uid("a")}@aris.test`;
    await addUser(email, "admin");
    const res = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    expect(res.status).toBe(200);
    expect(res.json.token).toBeTruthy();
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/aris_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const me = await api("GET", "/api/v1/auth/me", { session: await login(email) });
    expect(me.json.user).toMatchObject({ email, role: "admin", country: null, federationId: null });
    expect(me.json.user).not.toHaveProperty("scope");
  });

  it("returns the federation seat's country and code", async () => {
    const seat = await addFederationSeat("LGA");
    const me = await api("GET", "/api/v1/auth/me", { session: await login(seat.email) });
    expect(me.json.user).toMatchObject({ role: "federation", country: "LGA", federationCode: "LGAFF", federationId: seat.federationId });
  });

  it("accepts a Bearer token as well as the cookie", async () => {
    const email = `${uid("b")}@aris.test`;
    await addUser(email, "admin");
    const res = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    const me = await api("GET", "/api/v1/auth/me", { headers: { authorization: `Bearer ${res.json.token}` } });
    expect(me.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const email = `${uid("c")}@aris.test`;
    await addUser(email, "admin");
    const wrong = await api("POST", "/api/v1/auth/login", { body: { email, password: "not-the-password-xx" } });
    const unknown = await api("POST", "/api/v1/auth/login", { body: { email: "nobody@aris.test", password: "not-the-password-xx" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json).toEqual(unknown.json);
    expect(wrong.json.error.code).toBe("invalid_credentials");
  });

  it("refuses a malformed body (422) and non-JSON (400)", async () => {
    expect((await api("POST", "/api/v1/auth/login", { body: { email: "not-an-email", password: "x" } })).status).toBe(422);
    expect((await api("POST", "/api/v1/auth/login", { raw: "nope", headers: { "content-type": "application/json" } })).status).toBe(400);
  });

  it("requires a session for everything under /api/v1 except auth and public media", async () => {
    for (const path of ["/users", "/officials", "/federations", "/countries", "/teams", "/stadiums", "/notifications", "/audit", "/me"]) {
      expect((await api("GET", `/api/v1${path}`)).status, path).toBe(401);
    }
  });
});
