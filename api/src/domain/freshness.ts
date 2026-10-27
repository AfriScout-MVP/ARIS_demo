// "Data freshness" of a country: how long ago its fixtures, crews, matches or observer reports last changed.
//
// This replaces the old seeded `countries.sync_health` / `last_sync_hours` columns, which were fixed numbers that
// nothing ever updated. The figure is now read from the rows themselves, so a federation that stops entering data
// shows up as stale on its own.

/** Changed within this many hours: the country's data is up to date. */
export const FRESH_WITHIN_HOURS = 7 * 24;
/** Older than FRESH_WITHIN_HOURS is "stale"; a country with no data at all is "none". */
export type Freshness = "healthy" | "stale" | "none";

/**
 * The latest change per country code, one statement. `scope` is a `countryFilter` fragment on the column `x.cc`.
 * Fixtures count by their own country; matches and reports by their competition's country.
 */
export function latestActivitySql(scopeSql: string) {
  return `SELECT cc, MAX(at) AS at FROM (
      SELECT f.country_code AS cc, MAX(MAX(f.created_at, COALESCE(f.published_at, f.created_at))) AS at FROM fixtures f GROUP BY f.country_code
      UNION ALL SELECT f.country_code, MAX(d.updated_at) FROM designations d JOIN fixtures f ON f.id = d.fixture_id GROUP BY f.country_code
      UNION ALL SELECT c.country_code, MAX(m.updated_at) FROM matches m JOIN competitions c ON c.id = m.league_id GROUP BY c.country_code
      UNION ALL SELECT c.country_code, MAX(a.updated_at) FROM assessments a JOIN matches m ON m.id = a.match_id JOIN competitions c ON c.id = m.league_id GROUP BY c.country_code
    ) x WHERE at IS NOT NULL AND ${scopeSql} GROUP BY cc`;
}

/** Whole hours between an ISO instant and now (never negative), or null when there is no instant. */
export function hoursSince(at: string | null | undefined, now = Date.now()): number | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 3_600_000));
}

export function freshness(at: string | null | undefined, now = Date.now()): { health: Freshness; hours: number | null } {
  const hours = hoursSince(at, now);
  if (hours === null) return { health: "none", hours: null };
  return { health: hours <= FRESH_WITHIN_HOURS ? "healthy" : "stale", hours };
}
