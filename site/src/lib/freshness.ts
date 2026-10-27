// Data freshness of a country, as the API derives it (api/src/domain/freshness.ts): how long ago its fixtures,
// crews, matches or observer reports last changed. Replaces the old seeded "sync health", which never moved.

import type { TKey } from "@/locales";
import type { SyncHealth } from "@/lib/store";

/** Mirrors `FRESH_WITHIN_HOURS` (168 h) in the API: changed within this many days is "up to date". */
export const FRESH_WITHIN_DAYS = 7;

export const freshnessKey = {
  healthy: "federations.syncHealthy",
  stale: "federations.syncStale",
  none: "federations.syncNone",
} as const satisfies Record<SyncHealth, TKey>;

export const freshnessTone = { healthy: "pitch", stale: "amber", none: "neutral" } as const satisfies Record<SyncHealth, "pitch" | "amber" | "neutral">;

/** "5 h" under two days, "12 d" after; null when there is no data. The unit words come from the caller. */
export function freshnessAge(hours: number | null | undefined, units: { h: string; d: string }): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  return hours < 48 ? `${hours} ${units.h}` : `${Math.floor(hours / 24)} ${units.d}`;
}
