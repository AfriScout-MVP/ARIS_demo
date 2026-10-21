// Small checks shared by the payment and discipline routes: a record may point at a fixture only when that
// fixture really concerns the official (same country, or they are designated on it). A reference that
// fails looks exactly like one that does not exist, so a federation cannot probe for another country's fixtures.

import { ApiError } from "../lib/http";

export async function assertFixtureLink(db: D1Database, fixtureId: string, officialId: string, officialCountry: string) {
  const ok = await db
    .prepare(
      `SELECT 1 AS x FROM fixtures f
        WHERE f.id = ?1 AND (f.country_code = ?2 OR EXISTS (SELECT 1 FROM designations d WHERE d.fixture_id = f.id AND d.official_id = ?3))`,
    )
    .bind(fixtureId, officialCountry, officialId)
    .first();
  if (!ok) throw new ApiError(422, "unknown_reference", "Unknown fixture");
}
