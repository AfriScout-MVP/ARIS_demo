import type { AuthUser } from "../env";
import { forbidden } from "./http";

export const isStaff = (u: AuthUser) => u.role === "admin" || u.role === "commission";

/** Staff see every official; observers see the register; an official sees only their own file. */
export function canReadOfficial(u: AuthUser, officialId: string) {
  return isStaff(u) || u.role === "observer" || u.officialId === officialId;
}

/** May this user act on behalf of this official (their own space, or staff on their behalf)? */
export function canActFor(u: AuthUser, officialId: string) {
  return isStaff(u) || u.officialId === officialId;
}

export function assertActFor(u: AuthUser, officialId: string) {
  if (!canActFor(u, officialId)) throw forbidden();
}

export function assertReadOfficial(u: AuthUser, officialId: string) {
  if (!canReadOfficial(u, officialId)) throw forbidden();
}

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
