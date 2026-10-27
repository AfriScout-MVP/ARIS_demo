// What each role may see and do. The API enforces all of it; these helpers
// only decide what the interface offers, so nobody is shown a button that will answer 403/404.

import type { TKey } from "@/locales";
import type { Role, SessionUser } from "@/lib/api/types";

export type { Role };

type MaybeUser = Pick<SessionUser, "role"> | null | undefined;

export const isAdmin = (user: MaybeUser) => user?.role === "admin";
export const isFederation = (user: MaybeUser) => user?.role === "federation";
export const isReferee = (user: MaybeUser) => user?.role === "referee";
/** A tagger: country-scoped like a federation seat, but reaches only the tagging screen (see `/decision-engine`). */
export const isTagger = (user: MaybeUser) => user?.role === "tagger";
/** Staff = admin + federation: everyone who works in the full product shell. A tagger is deliberately not staff. */
export const isStaff = (user: MaybeUser) => isAdmin(user) || isFederation(user);

const ROLE_LABEL: Record<Role, TKey> = {
  admin: "auth.role.admin",
  federation: "auth.role.federation",
  referee: "auth.role.referee",
  tagger: "auth.role.tagger",
};

/** Translation key of the role's label: Super-admin / Federation / Referee. */
export function roleLabelKey(role: Role): TKey {
  return ROLE_LABEL[role];
}

/** The one country a federation seat (or a tagger) is confined to; null for every other role. */
export function lockedCountry(user: Pick<SessionUser, "role" | "country"> | null | undefined): string | null {
  return user?.role === "federation" || user?.role === "tagger" ? (user.country ?? null) : null;
}

/**
 * May this user designate officials on a fixture of `fixtureCountry`? Admins on any;
 * a federation only on its own country's fixtures (never on continental `CAF` ties);
 * referees never.
 */
export function canDesignate(
  user: Pick<SessionUser, "role" | "country"> | null | undefined,
  fixtureCountry: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "federation") return fixtureCountry !== "CAF" && user.country === fixtureCountry;
  return false;
}

/** Where a signed-in user lands: referees in their personal space, a tagger on its one screen, staff in the product. */
export function homePathFor(role: Role) {
  if (role === "referee") return "/me";
  if (role === "tagger") return "/decision-engine";
  return "/";
}
