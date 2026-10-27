// Fixtures and the designations on them.

import { countries, fixtureNations, fixtures } from "../../seed/demo-data";
import { toUtcIso } from "../../src/lib/time";
import type { SeedContext } from "./context";

const nationNames = new Set(countries.map((c) => c.name));

export function writeFixtures(ctx: SeedContext) {
  const out = ctx.sql.section("fixtures");
  const pairings = new Set<string>();
  const rows = fixtures.map((f) => {
    const nations = f.countryCode === "CAF" ? fixtureNations.get(f.id) : undefined;
    const homeCountry = nations?.[0] ?? f.countryCode;
    const awayCountry = nations?.[1] ?? f.countryCode;
    const homeKind = nationNames.has(f.home) ? "national" : "club";
    const awayKind = nationNames.has(f.away) ? "national" : "club";
    const homeTeam = ctx.teams.get(f.home, homeCountry, homeKind);
    const awayTeam = ctx.teams.get(f.away, awayCountry, awayKind);
    // the stadium belongs to the host: the fixture's country, or the home side's nation on a continental tie
    const stadium = ctx.stadiums.get(f.venue, f.city, homeCountry);

    const required = f.crew.filter((s) => s.role !== "OBS");
    const designationStatus = f.played
      ? "published"
      : required.every((s) => s.state === "confirmed")
        ? "validated"
        : required.every((s) => s.officialId && s.state !== "declined")
          ? "awaiting_confirmation"
          : "draft";
    // the round the generator scheduled; a pairing repeats only in the return half, a later round
    let round = f.matchday;
    while (pairings.has(`${f.competitionId}|${round}|${homeTeam}|${awayTeam}`)) round += 1;
    pairings.add(`${f.competitionId}|${round}|${homeTeam}|${awayTeam}`);
    const kickoffAt = toUtcIso(ctx.sh(f.date), f.kickoff, ctx.timezone(homeCountry));
    return [f.id, f.countryCode, f.competitionId, round, homeTeam, awayTeam, stadium, kickoffAt, f.importance, f.risk, f.played ? "played" : "scheduled", designationStatus];
  });
  out.comment("fixtures — kickoff stored in UTC, shown at the venue's local time");
  out.insert("fixtures", ["id", "country_code", "competition_id", "round_no", "home_team_id", "away_team_id", "stadium_id", "kickoff_at", "importance", "risk", "status", "designation_status"], rows);
  out.insert(
    "designations",
    ["fixture_id", "role", "official_id", "state"],
    fixtures.flatMap((f) => f.crew.map((s) => [f.id, s.role, s.officialId, s.officialId ? s.state : "empty"])),
  );
}
