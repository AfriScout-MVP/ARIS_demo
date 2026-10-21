import { describe, expect, it } from "vitest";
import { addUser, api, login, sql, uid } from "../helpers";

describe("PATCH /auth/me", () => {
  it("lets a user change their own language and name, in all four locales", async () => {
    const email = `${uid("l")}@aris.test`;
    const id = await addUser(email, "admin");
    const session = await login(email);
    for (const locale of ["en", "es", "de", "fr"]) {
      const res = await api("PATCH", "/api/v1/auth/me", { session, body: { locale } });
      expect(res.status).toBe(200);
      expect(res.json.user.locale).toBe(locale);
    }
    const res = await api("PATCH", "/api/v1/auth/me", { session, body: { name: "New Name", locale: "de" } });
    expect(res.json.user).toMatchObject({ name: "New Name", locale: "de" });
    expect((await sql("SELECT locale FROM users WHERE id = ?", id).first<{ locale: string }>())!.locale).toBe("de");
    // the session survives (no token bump) and the change is audited
    expect((await api("GET", "/api/v1/auth/me", { session })).json.user.locale).toBe("de");
    const n = await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.update_self' AND entity_id = ?", id).first<{ n: number }>();
    expect(n!.n).toBe(5);
  });

  it("refuses an unknown locale, an empty body, and ignores role changes", async () => {
    const email = `${uid("l2")}@aris.test`;
    const id = await addUser(email, "referee").catch(() => null);
    expect(id).toBeNull(); // a referee needs an official: the schema says so
    const admin = await addUser(`${uid("l3")}@aris.test`, "admin");
    expect(admin).toBeTruthy();
    const session = await login((await sql("SELECT email FROM users WHERE id = ?", admin).first<{ email: string }>())!.email);
    expect((await api("PATCH", "/api/v1/auth/me", { session, body: { locale: "xx" } })).status).toBe(422);
    expect((await api("PATCH", "/api/v1/auth/me", { session, body: {} })).status).toBe(422);
    const res = await api("PATCH", "/api/v1/auth/me", { session, body: { name: "Same", role: "referee" } });
    expect(res.json.user.role).toBe("admin");
  });

  it("requires a session", async () => {
    expect((await api("PATCH", "/api/v1/auth/me", { body: { locale: "en" } })).status).toBe(401);
  });
});
