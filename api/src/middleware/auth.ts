import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, AuthUser, Locale, Role } from "../env";
import { ApiError, forbidden } from "../lib/http";
import { verifyToken } from "../lib/crypto";

export const SESSION_COOKIE = "aris_session";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  official_id: string | null;
  federation_id: string | null;
  locale: Locale;
  active: number;
  token_version: number;
  fed_code: string | null;
  fed_country: string | null;
  fed_status: string | null;
  country_active: number | null;
}

/** The one query that turns a user id into a caller — also used by sign-in so both agree. */
const USER_COLUMNS = `u.id, u.email, u.name, u.role, u.official_id, u.federation_id, u.locale, u.active, u.token_version,
         f.code AS fed_code, f.country AS fed_country, f.status AS fed_status, c.active AS country_active`;
const USER_FROM = `FROM users u
    LEFT JOIN federations f ON f.id = u.federation_id
    LEFT JOIN countries c ON c.code = f.country`;
export const USER_SQL = `SELECT ${USER_COLUMNS} ${USER_FROM}`;
/** Sign-in additionally needs the password hash, which no other request should load. */
export const LOGIN_SQL = `SELECT ${USER_COLUMNS}, u.password_hash ${USER_FROM}`;

/**
 * Whether the account may be used right now. A federation seat dies with its federation:
 * suspending the federation or withdrawing the country from the supported list closes every seat at once.
 */
export function isUsable(row: Pick<UserRow, "role" | "active" | "fed_status" | "country_active">) {
  if (row.active !== 1) return false;
  if (row.role === "federation") return row.fed_status === "active" && row.country_active === 1;
  return true;
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    officialId: row.official_id,
    federationId: row.federation_id,
    country: row.role === "federation" ? row.fed_country : null,
    federationCode: row.role === "federation" ? row.fed_code : null,
    locale: row.locale,
  };
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
      const row = await c.env.DB.prepare(`${USER_SQL} WHERE u.id = ?`).bind(payload.sub).first<UserRow>();
      if (row && isUsable(row) && row.token_version === payload.tv) {
        c.set("user", toAuthUser(row));
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

/** Admin and federation seats — everyone who runs a competition, as opposed to officials. */
export const staff = requireRole("admin", "federation");
