// Client-side filtering of the lists the console loads whole.

import type { AuditEntry, CountryRow, TeamRow, UserRow } from "@/lib/api/admin";
import type { AdminRole, ZoneCode } from "./constants";

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Accent- and case-insensitive: "Ségou" is found by "segou". */
export const matches = (haystack: Array<string | null | undefined>, needle: string) => {
  const n = norm(needle.trim());
  return n === "" || haystack.some((h) => norm(h).includes(n));
};

export function filterUsers(users: UserRow[], { q, role }: { q: string; role: AdminRole | "all" }): UserRow[] {
  return users.filter(
    (u) =>
      (role === "all" || u.role === role) &&
      matches([u.name, u.email, u.officialName, u.federationCode, u.country], q),
  );
}

export function filterCountries(
  countries: CountryRow[],
  { q, zone, inactive }: { q: string; zone: ZoneCode | "all"; inactive: boolean },
): CountryRow[] {
  return countries.filter(
    (c) =>
      (inactive || c.active) &&
      (zone === "all" || c.zone === zone) &&
      matches([c.code, c.iso2, c.name, c.nameFr, c.nameEs, c.nameDe, c.capital, c.federation, c.federationName], q),
  );
}

export function filterTeams(teams: TeamRow[], { q, kind }: { q: string; kind: TeamRow["kind"] | "all" }): TeamRow[] {
  return teams.filter((t) => (kind === "all" || t.kind === kind) && matches([t.name, t.shortName, t.city], q));
}

/** Pretty JSON for the audit payloads; always text, never markup. */
export function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

export function filterAudit(entries: AuditEntry[], { action, q }: { action: string; q: string }): AuditEntry[] {
  const actionNeedle = action.trim().toLowerCase();
  return entries.filter((e) => {
    if (actionNeedle && !e.action.toLowerCase().includes(actionNeedle)) return false;
    if (!q.trim()) return true;
    return matches(
      [e.action, e.entity, e.entityId, e.actorName, e.actorRole, e.reason, e.ip, e.countryCode, prettyJson(e.before), prettyJson(e.after)],
      q,
    );
  });
}

/** Newest first; ids grow with time, the timestamp only breaks ties. */
export const newestFirst = (a: AuditEntry, b: AuditEntry) => b.id - a.id || b.at.localeCompare(a.at);
