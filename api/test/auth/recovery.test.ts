import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, PASSWORD, sql, uid } from "../helpers";

let ipCounter = 0;
const freshIp = () => `10.13.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
const forgot = (email: string, ip = freshIp()) => api("POST", "/api/v1/auth/forgot", { body: { email }, headers: { "cf-connecting-ip": ip } });
const reset = (token: string, password: string, ip = freshIp()) => api("POST", "/api/v1/auth/reset", { body: { token, password }, headers: { "cf-connecting-ip": ip } });
const NEW = "a-brand-new-recovered-passphrase";

/** The token, as the person would read it in the e-mail (the only place it exists). */
async function tokenFor(userId: string) {
  const row = await sql("SELECT body FROM notification_outbox WHERE user_id = ? AND subject IS NOT NULL ORDER BY id DESC LIMIT 1", userId).first<{ body: string }>();
  return row!.body.match(/token=([A-Za-z0-9_-]+)/)![1];
}

async function account(role: "admin" | "referee" = "admin") {
  const email = `${uid("rc")}@aris.test`;
  let id: string;
  if (role === "referee") {
    const off = uid("rc-off");
    await addOfficial(off, "RCA");
    id = await addUser(email, "referee", { officialId: off, locale: "en" });
  } else id = await addUser(email, "admin", { locale: "en" });
  return { email, id };
}

describe("forgot password", () => {
  it("answers the same 202 for a known, an unknown and a closed account, and mails only the known one", async () => {
    const known = await account();
    const closed = await account();
    await sql("UPDATE users SET active = 0 WHERE id = ?", closed.id).run();
    const a = await forgot(known.email);
    const b = await forgot(`nobody-${uid("x")}@aris.test`);
    const c = await forgot(closed.email);
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(c.status).toBe(202);
    expect(b.text).toBe(a.text);
    expect(c.text).toBe(a.text);
    expect((await sql("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?", known.id).first<{ n: number }>())!.n).toBe(1);
    expect((await sql("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?", closed.id).first<{ n: number }>())!.n).toBe(0);
    const mail = await sql("SELECT recipient, subject, body, status, expires_at FROM notification_outbox WHERE user_id = ?", known.id).first<Record<string, string>>();
    expect(mail).toMatchObject({ recipient: known.email, subject: "ARIS — reset your password", status: "queued" });
    expect(mail!.body).toContain("https://aris.test/reset-password?token=");
    expect(await sql("SELECT action FROM audit_log WHERE entity_id = ? AND action = 'auth.forgot_password'", known.id).first()).not.toBeNull();
  });

  it("stores only a SHA-256 of a 32-byte token", async () => {
    const u = await account();
    await forgot(u.email);
    const token = await tokenFor(u.id);
    expect(token.length).toBe(43); // 32 bytes, base64url
    const row = await sql("SELECT token_hash FROM password_resets WHERE user_id = ?", u.id).first<{ token_hash: string }>();
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.token_hash).not.toContain(token);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
    expect(row!.token_hash).toBe(Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join(""));
  });

  it("validates the address", async () => {
    expect((await forgot("not-an-email")).status).toBe(422);
  });

  it("throttles per address (3 / 15 min) and per network address (20 / 15 min), whether or not the account exists", async () => {
    const u = await account();
    for (let i = 0; i < 3; i++) expect((await forgot(u.email)).status).toBe(202);
    const blocked = await forgot(u.email);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
    // sign-in is not locked by it
    await login(u.email);

    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await forgot(`ghost-${i}-${uid("g")}@aris.test`, ip)).status).toBe(202);
    expect((await forgot(`ghost-last-${uid("g")}@aris.test`, ip)).status).toBe(429);
  });
});

describe("reset password", () => {
  it("sets the new password, signs out everywhere, consumes the link, audits and tells the holder", async () => {
    const u = await account("referee");
    const session = await login(u.email);
    await forgot(u.email);
    const token = await tokenFor(u.id);
    const before = (await sql("SELECT token_version FROM users WHERE id = ?", u.id).first<{ token_version: number }>())!.token_version;

    const res = await reset(token, NEW);
    expect(res.status).toBe(200);
    expect((await sql("SELECT token_version FROM users WHERE id = ?", u.id).first<{ token_version: number }>())!.token_version).toBe(before + 1);
    expect((await api("GET", "/api/v1/auth/me", { session })).status).toBe(401);
    await login(u.email, NEW);
    expect((await api("POST", "/api/v1/auth/login", { body: { email: u.email, password: PASSWORD } })).status).toBe(401);
    expect(await sql("SELECT 1 AS x FROM audit_log WHERE entity_id = ? AND action = 'auth.reset_password'", u.id).first()).not.toBeNull();
    // in-app notice and an e-mail copy
    const notice = await sql("SELECT n.id FROM notifications n JOIN notification_outbox o ON o.notification_id = n.id WHERE n.user_id = ? AND o.recipient = ?", u.id, u.email).first();
    expect(notice).not.toBeNull();

    // single use
    const again = await reset(token, "yet-another-long-passphrase");
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe("invalid_token");
    await login(u.email, NEW);
  });

  it("refuses an expired link", async () => {
    const u = await account();
    await forgot(u.email);
    const token = await tokenFor(u.id);
    await sql("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?", u.id).run();
    expect((await reset(token, NEW)).json.error.code).toBe("invalid_token");
    await login(u.email); // unchanged
  });

  it("expires 60 minutes after it was issued", async () => {
    const u = await account();
    const t0 = Date.now();
    await forgot(u.email);
    const row = await sql("SELECT expires_at FROM password_resets WHERE user_id = ?", u.id).first<{ expires_at: string }>();
    const minutes = (Date.parse(row!.expires_at) - t0) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(61);
  });

  it("is invalidated by a newer link, by a password change and by an administrator's reset", async () => {
    const u = await account();
    await forgot(u.email);
    const older = await tokenFor(u.id);
    await forgot(u.email);
    const newer = await tokenFor(u.id);
    expect(older).not.toBe(newer);
    expect((await reset(older, NEW)).json.error.code).toBe("invalid_token");

    // a change of password kills the outstanding link
    const s = await login(u.email);
    expect((await api("POST", "/api/v1/auth/change-password", { session: s, body: { currentPassword: PASSWORD, newPassword: "changed-in-the-meantime" } })).status).toBe(200);
    expect((await reset(newer, NEW)).json.error.code).toBe("invalid_token");

    // so does a reset by an administrator (and any other bump of token_version)
    await forgot(u.email);
    const third = await tokenFor(u.id);
    const bossEmail = `${uid("boss")}@aris.test`;
    await addUser(bossEmail, "admin");
    const boss = await login(bossEmail);
    expect((await api("POST", `/api/v1/users/${u.id}/reset-password`, { session: boss, body: { password: "admin-chosen-passphrase" } })).status).toBe(200);
    expect((await reset(third, NEW)).json.error.code).toBe("invalid_token");
  });

  it("applies the password policy and clears a forced change", async () => {
    const u = await account();
    await sql("UPDATE users SET must_change_password = 1 WHERE id = ?", u.id).run();
    await forgot(u.email);
    const token = await tokenFor(u.id);
    const short = await reset(token, "short");
    expect(short.status).toBe(422);
    expect(short.json.error.code).toBe("validation_failed");
    expect((await reset(token, NEW)).status).toBe(200);
    expect((await login(u.email, NEW)).user).toMatchObject({ mustChangePassword: false });
  });

  it("refuses a closed federation seat's link, and throttles failed resets per network address", async () => {
    const seat = await addFederationSeat("RCF");
    await forgot(seat.email);
    const token = await tokenFor(seat.userId);
    await sql("UPDATE federations SET status = 'suspended' WHERE id = ?", seat.federationId).run();
    expect((await reset(token, NEW)).json.error.code).toBe("invalid_token");

    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await reset(`not-a-real-token-${i}-padding`, NEW, ip)).status).toBe(400);
    const blocked = await reset("not-a-real-token-x-padding", NEW, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
  });
});
