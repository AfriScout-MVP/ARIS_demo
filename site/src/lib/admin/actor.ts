import { ADMIN_ROLES, type AdminRole } from "./constants";

/** The signed-in person, reduced to what the console decides on. */
export interface Actor {
  id: string;
  /** `null` when the session carries a role the console does not know. */
  role: AdminRole | null;
  /** ISO alpha-3 of the national federation; null for the super-admin and for referees. */
  country: string | null;
  federationId: string | null;
  federationCode: string | null;
}

/** Reads the session user defensively: the session shape is owned by the data layer, not by the console. */
export function toActor(user: unknown): Actor | null {
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const role = (ADMIN_ROLES as readonly unknown[]).includes(u.role) ? (u.role as AdminRole) : null;
  return {
    id: str(u.id) ?? "",
    role,
    country: str(u.country),
    federationId: str(u.federationId),
    federationCode: str(u.federationCode),
  };
}

export const isAdmin = (actor: Actor | null) => actor?.role === "admin";
export const isFederation = (actor: Actor | null) => actor?.role === "federation";
export const isStaff = (actor: Actor | null) => isAdmin(actor) || isFederation(actor);

/** Roles the actor may hand out when creating an account. */
export function creatableRoles(actor: Actor | null): AdminRole[] {
  if (isAdmin(actor)) return ["admin", "federation", "referee"];
  if (isFederation(actor)) return ["referee"];
  return [];
}

/** A federation seat only manages the referee accounts of its own country and never touches seats. */
export function canManageUser(actor: Actor | null, target: { id: string; role: string; country: string | null }): boolean {
  if (isAdmin(actor)) return true;
  if (isFederation(actor)) return target.role === "referee" && target.country !== null && target.country === actor?.country;
  return false;
}

/** Changing one's own role or switching oneself off would lock the actor out; the server refuses the last admin anyway. */
export const isSelf = (actor: Actor | null, userId: string) => actor !== null && actor.id === userId;
