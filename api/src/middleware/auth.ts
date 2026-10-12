import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, AuthUser, Role } from "../env";
import { ApiError, forbidden } from "../lib/http";
import { verifyToken } from "../lib/crypto";

export const SESSION_COOKIE = "aris_session";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  official_id: string | null;
  scope: string;
  locale: "fr" | "en";
  active: number;
  token_version: number;
}

/**
 * Resolves the caller from a session cookie or a Bearer token and loads the
 * account from the database on every request — so deactivating a user or
 * changing their password takes effect immediately, not when the token expires.
 */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("viaCookie", false);
  c.set("ip", c.req.header("cf-connecting-ip") ?? "unknown");

  const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const cookie = getCookie(c, SESSION_COOKIE);
  const token = bearer ?? cookie;

  if (token) {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) {
      const row = await c.env.DB.prepare(
        "SELECT id, email, name, role, official_id, scope, locale, active, token_version FROM users WHERE id = ?",
      )
        .bind(payload.sub)
        .first<UserRow>();
      if (row && row.active === 1 && row.token_version === payload.tv) {
        const user: AuthUser = {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          officialId: row.official_id,
          scope: row.scope,
          locale: row.locale,
        };
        c.set("user", user);
        c.set("viaCookie", !bearer && !!cookie);
      }
    }
  }
  await next();
};

export function currentUser(c: { get: (k: "user") => AuthUser | null }): AuthUser {
  const user = c.get("user");
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue");
  return user;
}

/** Route guard: the caller must be signed in and hold one of `roles`. */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = currentUser(c);
    if (!roles.includes(user.role)) throw forbidden();
    await next();
  };
}

/** Admin and commission staff — everyone who runs the competition, as opposed to officials. */
export const staff = requireRole("admin", "commission");

/** True when the user may run designations for a fixture in this country. */
export function inScope(user: AuthUser, countryCode: string, zoneOf: (code: string) => string | undefined) {
  if (user.role === "admin" || user.scope === "all") return true;
  if (user.role !== "commission") return false;
  if (user.scope.startsWith("country:")) return user.scope.slice(8) === countryCode;
  if (user.scope.startsWith("zone:")) return zoneOf(countryCode) === user.scope.slice(5);
  return false;
}
