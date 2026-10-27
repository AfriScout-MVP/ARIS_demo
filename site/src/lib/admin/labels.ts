import type { Tone } from "@/components/ui";
import type { TKey } from "@/locales";
import type { AdminRole, TeamKind, ZoneCode } from "./constants";

export const roleLabelKey = (role: AdminRole): TKey => `admin.roles.${role}`;

export const roleTone = (role: AdminRole): Tone => (role === "admin" ? "gold" : role === "federation" ? "var" : role === "tagger" ? "amber" : "pitch");

export const zoneLabelKey = (zone: ZoneCode): TKey => `admin.zones.${zone}`;

export const teamKindKey = (kind: TeamKind): TKey => `admin.teams.kinds.${kind}`;

export const federationStatusKey = (status: "active" | "suspended"): TKey => `admin.status.${status}`;

/** A translation that may not exist (a role or entity the server invented): the fallback wins when the key is returned as-is. */
export function translateOr(t: (key: TKey) => string, key: string, fallback: string): string {
  const text = t(key as TKey);
  return text === key ? fallback : text;
}

/** A country's name in the visitor's language; English as the last resort. */
export function countryLabel(
  c: { code: string; name?: string; nameFr?: string; nameEs?: string; nameDe?: string } | undefined,
  locale: "fr" | "en" | "es" | "de",
  fallback = "",
): string {
  if (!c) return fallback;
  const byLocale = { fr: c.nameFr, en: c.name, es: c.nameEs, de: c.nameDe }[locale];
  return byLocale || c.nameFr || c.name || c.code;
}
