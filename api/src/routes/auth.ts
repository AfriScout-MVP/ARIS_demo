import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, readJson } from "../lib/http";
import { burnVerify, hashPassword, randomToken, sha256Hex, signToken, verifyPassword } from "../lib/crypto";
import { auditStmt } from "../lib/audit";
import { directMailStmt, drainOutbox, notifyStmts } from "../lib/notify";
import { localized } from "../lib/localized";
import { RESET_MINUTES, resetLink, resetMail } from "../domain/recovery-mail";
import { LOGIN_SQL, SESSION_COOKIE, USER_SQL, currentUser, isUsable, toAuthUser, type UserRow } from "../middleware/auth";
import { LOCALES } from "../env";

export const SESSION_SECONDS = 12 * 60 * 60;
export const MIN_PASSWORD = 12;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`)
  .max(200);

// Throttle: 5 failures per account or 30 per address in 15 minutes.
const WINDOW = "-15 minutes";
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 30;

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const auth = new Hono<AppEnv>();

auth.post("/login", async (c) => {
  const { email, password } = await readJson(c, loginSchema);
  const ip = c.get("ip");
  const db = c.env.DB;

  const recent = await db
    .prepare(
      `SELECT SUM(email = ?1) AS by_email, COUNT(*) AS by_ip FROM login_attempts
        WHERE success = 0 AND at > strftime('%Y-%m-%dT%H:%M:%fZ','now', ?2) AND (email = ?1 OR ip = ?3)`,
    )
    .bind(email, WINDOW, ip)
    .first<{ by_email: number | null; by_ip: number }>();
  if ((recent?.by_email ?? 0) >= MAX_PER_EMAIL || (recent?.by_ip ?? 0) >= MAX_PER_IP) {
    c.header("Retry-After", "900");
    throw new ApiError(429, "too_many_attempts", "Too many failed sign-ins. Try again in 15 minutes.");
  }

  const row = await db.prepare(`${LOGIN_SQL} WHERE u.email = ?`).bind(email).first<UserRow & { password_hash: string }>();
  const valid = row ? await verifyPassword(password, row.password_hash) : await burnVerify(password);
  if (!row || !valid || !isUsable(row)) {
    await db.prepare("INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)").bind(email, ip).run();
    // One message for every failure: it must not reveal which accounts exist.
    throw new ApiError(401, "invalid_credentials", "Incorrect e-mail or password");
  }
  const user = toAuthUser(row);

  await db.batch([
    db.prepare("INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 1)").bind(email, ip),
    db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(user.id),
    auditStmt(db, user, { action: "auth.login", entity: "user", entityId: user.id, countryCode: user.country, ip }),
  ]);

  const token = await signToken({ sub: user.id, tv: row.token_version }, c.env.JWT_SECRET, SESSION_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return c.json({ token, user });
});

// Signing out ends this session on the server too: the token's id is listed as revoked, so a copy of the token
// (another tab, a stolen cookie, a script holding the Bearer value) stops working at once. Other sessions of the
// same account are untouched — changing the password is what signs out everywhere.
auth.post("/logout", async (c) => {
  const user = c.get("user");
  const token = c.get("token");
  if (user && token) {
    const db = c.env.DB;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)").bind(token.jti, user.id, token.exp),
      auditStmt(db, user, { action: "auth.logout", entity: "user", entityId: user.id, countryCode: user.country, ip: c.get("ip") }),
    ]);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", (c) => c.json({ user: currentUser(c) }));

// A user changing their own language or display name. Nothing else about an account is self-service.
const selfSchema = z
  .object({ locale: z.enum(LOCALES as [string, ...string[]]), name: z.string().trim().min(1).max(120) })
  .partial()
  .refine((b) => b.locale !== undefined || b.name !== undefined, "Send locale and/or name");

auth.patch("/me", async (c) => {
  const user = currentUser(c);
  const body = await readJson(c, selfSchema);
  const db = c.env.DB;
  await db.batch([
    db.prepare("UPDATE users SET name = COALESCE(?, name), locale = COALESCE(?, locale) WHERE id = ?").bind(body.name ?? null, body.locale ?? null, user.id),
    auditStmt(db, user, { action: "user.update_self", entity: "user", entityId: user.id, before: { name: user.name, locale: user.locale }, after: body, countryCode: user.country, ip: c.get("ip") }),
  ]);
  const row = await db.prepare(`${USER_SQL} WHERE u.id = ?`).bind(user.id).first<UserRow>();
  return c.json({ user: toAuthUser(row!) });
});

const changeSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });

auth.post("/change-password", async (c) => {
  const user = currentUser(c);
  const { currentPassword, newPassword } = await readJson(c, changeSchema);
  const db = c.env.DB;
  const ip = c.get("ip");
  // The same throttle as sign-in, on the same counter: a stolen session must not become a way to guess the password.
  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE success = 0 AND email = ? AND at > strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)`)
    .bind(user.email, WINDOW)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_EMAIL) {
    c.header("Retry-After", "900");
    throw new ApiError(429, "too_many_attempts", "Too many failed attempts. Try again in 15 minutes.");
  }
  const row = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    await db.prepare("INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)").bind(user.email, ip).run();
    // 403, not 401: the session is fine, only the confirmation is wrong — a client must not sign the person out for it.
    throw new ApiError(403, "wrong_password", "Current password is incorrect");
  }
  if (currentPassword === newPassword) throw new ApiError(422, "same_password", "Choose a password you have not been using");
  // Bumping token_version signs the account out everywhere — including this session — and kills any reset link.
  // The password is now the holder's own, so a forced change is satisfied.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ?").bind(await hashPassword(newPassword), user.id),
    closeResetLinks(c.env.DB, user.id),
    auditStmt(c.env.DB, user, { action: "auth.change_password", entity: "user", entityId: user.id, countryCode: user.country, ip: c.get("ip") }),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true, signedOut: true });
});

/* ------------------------------- forgotten password ------------------------------- */

// Throttle for the signed-out recovery routes, on its own counter (asking for links must not lock sign-in):
// 3 links per address and 20 requests per network address in 15 minutes; 20 failed resets per network address.
const MAX_FORGOT_PER_EMAIL = 3;
const MAX_FORGOT_PER_IP = 20;
const MAX_RESET_FAILURES_PER_IP = 20;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Marks every outstanding reset link of an account used. Joins the batch of any password change. */
export const closeResetLinks = (db: D1Database, userId: string) =>
  db.prepare(`UPDATE password_resets SET used_at = ${NOW} WHERE user_id = ? AND used_at IS NULL`).bind(userId);

async function throttled(db: D1Database, kind: "forgot" | "reset", ip: string, email: string | null, maxEmail: number, maxIp: number) {
  const r = await db
    .prepare(
      `SELECT SUM(email = ?1) AS by_email, COUNT(*) AS by_ip FROM auth_throttle
        WHERE kind = ?2 AND at > strftime('%Y-%m-%dT%H:%M:%fZ','now', ?3) AND (email = ?1 OR ip = ?4)`,
    )
    .bind(email, kind, WINDOW, ip)
    .first<{ by_email: number | null; by_ip: number }>();
  return (email !== null && (r?.by_email ?? 0) >= maxEmail) || (r?.by_ip ?? 0) >= maxIp;
}

const FORGOT_REPLY = { ok: true, message: "If an account exists for this address, a link to reset its password is on its way." };

/**
 * Sends a password-reset link. The answer is the same 202 whether or not the address has an account (or the account
 * is closed), so the route cannot be used to find out who is registered. Only the SHA-256 of the token is stored.
 */
auth.post("/forgot", async (c) => {
  const { email: raw } = await readJson(c, z.object({ email: z.string().trim().email().max(200) }));
  const email = raw.toLowerCase();
  const ip = c.get("ip");
  const db = c.env.DB;

  if (await throttled(db, "forgot", ip, email, MAX_FORGOT_PER_EMAIL, MAX_FORGOT_PER_IP)) {
    c.header("Retry-After", "900");
    throw new ApiError(429, "too_many_attempts", "Too many requests. Try again in 15 minutes.");
  }
  await db.prepare("INSERT INTO auth_throttle (kind, email, ip) VALUES ('forgot', ?, ?)").bind(email, ip).run();

  const row = await db.prepare(`${USER_SQL} WHERE u.email = ?`).bind(email).first<UserRow>();
  if (row && isUsable(row)) {
    const user = toAuthUser(row);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + RESET_MINUTES * 60_000).toISOString();
    const origin = c.env.PUBLIC_ORIGIN || new URL(c.req.url).origin;
    const mail = resetMail(user.locale, user.name, resetLink(origin, token));
    const res = await db.batch([
      // only the newest link works
      closeResetLinks(db, user.id),
      db
        .prepare("INSERT INTO password_resets (token_hash, user_id, token_version, expires_at, ip) VALUES (?, ?, ?, ?, ?)")
        .bind(await sha256Hex(token), user.id, row.token_version, expiresAt, ip),
      directMailStmt(db, { userId: user.id, to: user.email, subject: mail.subject, body: mail.body, expiresAt }),
      auditStmt(db, user, { action: "auth.forgot_password", entity: "user", entityId: user.id, countryCode: user.country, ip }),
    ]);
    const outboxId = (res[2].results[0] as { id: number } | undefined)?.id;
    // deliver now rather than at the next cron tick; the reply does not wait for it
    if (outboxId !== undefined) {
      try {
        c.executionCtx.waitUntil(drainOutbox(c.env, { ids: [outboxId] }).catch(() => undefined));
      } catch {
        /* no execution context (scripts): the cron delivers it */
      }
    }
  }
  return c.json(FORGOT_REPLY, 202);
});

const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

/**
 * Sets a new password from a reset link. The link is consumed in the same transaction (a second use finds nothing),
 * token_version is bumped (every session ends), any forced change is satisfied, and the holder is told by notice
 * and e-mail that their password changed.
 */
auth.post("/reset", async (c) => {
  const { token, password } = await readJson(c, resetSchema);
  const ip = c.get("ip");
  const db = c.env.DB;
  if (await throttled(db, "reset", ip, null, 0, MAX_RESET_FAILURES_PER_IP)) {
    c.header("Retry-After", "900");
    throw new ApiError(429, "too_many_attempts", "Too many attempts. Try again in 15 minutes.");
  }
  const hash = await sha256Hex(token);
  const row = await db
    .prepare(
      `${USER_SQL} JOIN password_resets pr ON pr.user_id = u.id
        WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > ? AND pr.token_version = u.token_version`,
    )
    .bind(hash, new Date().toISOString())
    .first<UserRow>();
  if (!row || !isUsable(row)) {
    await db.prepare("INSERT INTO auth_throttle (kind, email, ip) VALUES ('reset', NULL, ?)").bind(ip).run();
    throw new ApiError(400, "invalid_token", "This link is invalid or has expired. Ask for a new one.");
  }
  const user = toAuthUser(row);
  try {
    await db.batch([
      // consume first; if a concurrent request already did, the guard below aborts the whole batch
      db.prepare(`UPDATE password_resets SET used_at = ${NOW} WHERE token_hash = ? AND used_at IS NULL`).bind(hash),
      db.prepare("SELECT CASE WHEN changes() = 0 THEN json('reset_used') ELSE 1 END"),
      db
        .prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ? AND token_version = ?")
        .bind(await hashPassword(password), user.id, row.token_version),
      closeResetLinks(db, user.id),
      auditStmt(db, user, { action: "auth.reset_password", entity: "user", entityId: user.id, countryCode: user.country, ip }),
      ...notifyStmts(db, {
        userId: user.id,
        title: localized("Mot de passe réinitialisé", "Password reset", { es: "Contraseña restablecida", de: "Passwort zurückgesetzt" }),
        detail: localized(
          "Le mot de passe de votre compte vient d'être changé par un lien de réinitialisation. Si ce n'est pas vous, prévenez immédiatement un administrateur.",
          "Your account's password was just changed through a reset link. If this was not you, tell an administrator at once.",
          {
            es: "La contraseña de su cuenta acaba de cambiarse mediante un enlace de restablecimiento. Si no ha sido usted, avise de inmediato a un administrador.",
            de: "Das Passwort Ihres Kontos wurde soeben über einen Link zurückgesetzt. Wenn Sie das nicht waren, informieren Sie sofort einen Administrator.",
          },
        ),
        tone: "amber",
        href: user.role === "referee" ? "/me" : "/",
        channels: [{ channel: "email", recipient: user.email }],
      }),
    ]);
  } catch (err) {
    if (/malformed JSON/i.test(String(err))) throw new ApiError(400, "invalid_token", "This link is invalid or has expired. Ask for a new one.");
    throw err;
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
