import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, readJson } from "../lib/http";
import { burnVerify, hashPassword, signToken, verifyPassword } from "../lib/crypto";
import { auditStmt } from "../lib/audit";
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

auth.post("/logout", (c) => {
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
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new ApiError(401, "invalid_credentials", "Current password is incorrect");
  }
  // Bumping token_version signs the account out everywhere — including this session.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").bind(await hashPassword(newPassword), user.id),
    auditStmt(c.env.DB, user, { action: "auth.change_password", entity: "user", entityId: user.id, countryCode: user.country, ip: c.get("ip") }),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true, signedOut: true });
});
