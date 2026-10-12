import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Role } from "../env";
import { ApiError, readJson } from "../lib/http";
import { burnVerify, hashPassword, signToken, verifyPassword } from "../lib/crypto";
import { auditStmt } from "../lib/audit";
import { SESSION_COOKIE, currentUser } from "../middleware/auth";

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

  const user = await db
    .prepare("SELECT id, email, name, role, official_id, scope, locale, password_hash, active, token_version FROM users WHERE email = ?")
    .bind(email)
    .first<{
      id: string; email: string; name: string; role: Role; official_id: string | null; scope: string;
      locale: "fr" | "en"; password_hash: string; active: number; token_version: number;
    }>();

  const valid = user ? await verifyPassword(password, user.password_hash) : await burnVerify(password);
  if (!user || !valid || user.active !== 1) {
    await db.prepare("INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)").bind(email, ip).run();
    // One message for every failure: it must not reveal which accounts exist.
    throw new ApiError(401, "invalid_credentials", "Incorrect e-mail or password");
  }

  await db.batch([
    db.prepare("INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 1)").bind(email, ip),
    db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(user.id),
    auditStmt(db, user, { action: "auth.login", entity: "user", entityId: user.id, ip }),
  ]);

  const token = await signToken({ sub: user.id, tv: user.token_version }, c.env.JWT_SECRET, SESSION_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, officialId: user.official_id, scope: user.scope, locale: user.locale },
  });
});

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", (c) => c.json({ user: currentUser(c) }));

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
    auditStmt(c.env.DB, user, { action: "auth.change_password", entity: "user", entityId: user.id, ip: c.get("ip") }),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true, signedOut: true });
});
