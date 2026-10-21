import { describe, expect, it } from "vitest";
import { addUser, api, login, sql, uid } from "../helpers";

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

  it("every API response is uncacheable and unsniffable", async () => {
    const res = await api("GET", "/api/health");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
