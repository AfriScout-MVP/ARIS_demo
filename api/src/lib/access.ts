// Who may touch what. Every route goes through these helpers, so the three roles mean the same thing everywhere.
//
//   admin       everything, in every country (and the continental CAF competitions)
//   federation  everything that belongs to ONE country — its officials, fixtures, matches, payments, cases …
//   referee     only their own file and what concerns them

import type { AuthUser } from "../env";
import { forbidden, notFound } from "./http";

export const isAdmin = (u: AuthUser) => u.role === "admin";
export const isFederation = (u: AuthUser) => u.role === "federation";
/** Admin and federation seats — those who run competitions. */
export const isStaff = (u: AuthUser) => u.role === "admin" || u.role === "federation";

/** Continental ties (country code `CAF`) belong to the platform administrator, not to any one federation. */
export const CONTINENTAL = "CAF";

/** May this user run things in this country? Admin: any; federation: only its own; referee: none. */
export function inCountry(u: AuthUser, countryCode: string | null | undefined): boolean {
  if (u.role === "admin") return true;
  return u.role === "federation" && !!countryCode && countryCode !== CONTINENTAL && u.country === countryCode;
}

export function assertCountry(u: AuthUser, countryCode: string | null | undefined, what = "Resource") {
  // 404, not 403: a federation must not learn that another country's record exists
  if (!inCountry(u, countryCode)) throw u.role === "referee" ? forbidden() : notFound(what);
}

/** SQL fragment + params that confine a query to what the caller may see, on a column holding a country code. */
export function countryFilter(u: AuthUser, column: string): { sql: string; params: string[] } {
  if (u.role === "admin") return { sql: "1 = 1", params: [] };
  if (u.role === "federation" && u.country) return { sql: `${column} = ?`, params: [u.country] };
  return { sql: "1 = 0", params: [] };
}

/** The country a request is scoped to: a federation's own, or whatever an admin asked for (null = all). */
export function scopeCountry(u: AuthUser, requested?: string | null): string | null {
  if (u.role === "federation") return u.country;
  return requested || null;
}

/**
 * Load an official's country and decide whether the caller may read / act on them.
 * A referee reaches only their own file; a federation seat only officials of its country.
 */
export async function officialAccess(db: D1Database, u: AuthUser, officialId: string) {
  const row = await db.prepare("SELECT id, country_code FROM officials WHERE id = ?").bind(officialId).first<{ id: string; country_code: string }>();
  if (!row) throw notFound("Official");
  const own = u.role === "referee" && u.officialId === officialId;
  const managed = inCountry(u, row.country_code);
  return { countryCode: row.country_code, own, managed, canRead: own || managed, canAct: own || managed };
}

export async function assertReadOfficial(db: D1Database, u: AuthUser, officialId: string) {
  const a = await officialAccess(db, u, officialId);
  if (!a.canRead) throw u.role === "referee" ? forbidden() : notFound("Official");
  return a;
}

export const assertActFor = assertReadOfficial;

/** Account (if any) that belongs to an official, with the contact details notifications go to. */
export async function accountOf(db: D1Database, officialId: string) {
  return db
    .prepare(
      `SELECT u.id AS userId, COALESCE(o.email, u.email) AS email, o.phone AS phone, u.locale AS locale
         FROM officials o LEFT JOIN users u ON u.official_id = o.id AND u.active = 1 WHERE o.id = ?`,
    )
    .bind(officialId)
    .first<{ userId: string | null; email: string | null; phone: string | null; locale: string | null }>();
}
