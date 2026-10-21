// Pure scope logic: which countries a scope covers. No React, so it can be unit-tested.

import { countries, type Zone } from "@/lib/store";

export type Scope =
  | { kind: "all" }
  | { kind: "zone"; zone: Zone }
  | { kind: "country"; code: string };

export const ALL_SCOPE: Scope = { kind: "all" };

type Known = Array<{ code: string; zone: Zone }>;

export function serialiseScope(scope: Scope) {
  if (scope.kind === "all") return "all";
  if (scope.kind === "zone") return `zone:${scope.zone}`;
  return `country:${scope.code}`;
}

/** Read a stored scope against the countries that are loaded; anything unknown falls back to "all". */
export function parseScope(raw: string | null, known: Known = countries): Scope {
  if (!raw || raw === "all") return ALL_SCOPE;
  const [kind, value] = raw.split(":");
  if (kind === "zone" && known.some((c) => c.zone === value)) return { kind: "zone", zone: value as Zone };
  if (kind === "country" && known.some((c) => c.code === value)) return { kind: "country", code: value };
  return ALL_SCOPE;
}

/** The country codes a scope covers, given the loaded countries. */
export function codesFor(scope: Scope, known: Known = countries): string[] {
  if (scope.kind === "all") return known.map((c) => c.code);
  if (scope.kind === "zone") return known.filter((c) => c.zone === scope.zone).map((c) => c.code);
  return [scope.code];
}
