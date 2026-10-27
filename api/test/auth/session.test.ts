import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addUser, api, login, PASSWORD, sql, uid } from "../helpers";
import { signToken } from "../../src/lib/crypto";
import { runDaily } from "../../src/cron";

describe("sessions", () => {
  it("rejects a forged token", async () => {
    expect((await api("GET", "/api/v1/auth/me", { headers: { authorization: "Bearer aaa.bbb.ccc" } })).status).toBe(401);
  });

  it("stops working the moment the account is deactivated", async () => {
    const email = `${uid("d")}@aris.test`;
    const id = await addUser(email, "admin");
    const session = await login(email);
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(200);
    await sql("UPDATE users SET active = 0 WHERE id = ?", id).run();
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
  });

  it("stops working when token_version moves on", async () => {
    const email = `${uid("tv")}@aris.test`;
    const id = await addUser(email, "admin");
    const session = await login(email);
    await sql("UPDATE users SET token_version = token_version + 1 WHERE id = ?", id).run();
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
  });

  it("refuses state-changing requests from another origin", async () => {
    const res = await api("POST", "/api/v1/auth/logout", { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("cross_origin");
  });

  it("logout clears the cookie", async () => {
    const res = await api("POST", "/api/v1/auth/logout");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/aris_session=;/);
  });

  it("logout revokes the token itself: a copied cookie or Bearer value stops working at once", async () => {
    const email = `${uid("lo")}@aris.test`;
    const id = await addUser(email, "admin");
    const res = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    const session = { cookie: res.headers.get("set-cookie")!.split(";")[0], user: res.json.user };
    const bearer = { authorization: `Bearer ${res.json.token}` };
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { headers: bearer })).status).toBe(200);

    expect((await api("POST", "/api/v1/auth/logout", { session })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
    expect((await api("GET", "/api/v1/auth/me", { headers: bearer })).status).toBe(401);
    const audit = await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.logout' AND entity_id = ?", id).first<{ n: number }>();
    expect(audit!.n).toBe(1);
  });

  it("logout ends only that session: the account's other sessions keep working", async () => {
    const email = `${uid("lo2")}@aris.test`;
    await addUser(email, "admin");
    const laptop = await login(email);
    const phone = await login(email);
    await api("POST", "/api/v1/auth/logout", { session: laptop });
    expect((await api("GET", "/api/v1/auth/me", { session: laptop })).status).toBe(401);
    expect((await api("GET", "/api/v1/auth/me", { session: phone })).status).toBe(200);
  });

  it("logout with a Bearer token revokes it too, and a second logout is harmless", async () => {
    const email = `${uid("lo3")}@aris.test`;
    await addUser(email, "admin");
    const res = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    const headers = { authorization: `Bearer ${res.json.token}` };
    expect((await api("POST", "/api/v1/auth/logout", { headers })).status).toBe(200);
    expect((await api("POST", "/api/v1/auth/logout", { headers })).status).toBe(200);
    expect((await api("GET", "/api/v1/auth/me", { headers })).status).toBe(401);
  });

  it("refuses a well-signed token that carries no id, since it could never be signed out", async () => {
    const email = `${uid("nj")}@aris.test`;
    const id = await addUser(email, "admin");
    const now = Math.floor(Date.now() / 1000);
    // hand-build a token the way sign-in did before ids existed
    const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const data = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: id, tv: 0, iat: now, exp: now + 600 })}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect((await api("GET", "/api/v1/auth/me", { headers: { authorization: `Bearer ${data}.${sig}` } })).status).toBe(401);
    // the same account with a current token is fine
    const good = await signToken({ sub: id, tv: 0 }, env.JWT_SECRET, 600);
    expect((await api("GET", "/api/v1/auth/me", { headers: { authorization: `Bearer ${good}` } })).status).toBe(200);
  });

  it("the daily job forgets revocations once the token would have expired anyway", async () => {
    const email = `${uid("pr")}@aris.test`;
    const id = await addUser(email, "admin");
    await sql("INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES ('old-jti', ?, unixepoch() - 60), ('live-jti', ?, unixepoch() + 600)", id, id).run();
    await runDaily(env as never);
    const left = await sql("SELECT jti FROM revoked_tokens WHERE user_id = ? ORDER BY jti", id).all<{ jti: string }>();
    expect(left.results.map((r) => r.jti)).toEqual(["live-jti"]);
  });

  it("every API response is uncacheable and unsniffable", async () => {
    const res = await api("GET", "/api/health");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
