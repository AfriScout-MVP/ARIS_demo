// Countries, federations, competitions — the reference data every other table hangs on.
// Teams and stadiums are collected while the later modules run and written last (see `writeTeams`).

import { competitions, countries } from "../../seed/demo-data";
import { COUNTRY_FACTS } from "../../seed/real-world";
import { COUNTRY_REFERENCE } from "./reference";
import type { SeedContext } from "./context";

export const SEASON = "2026/2027";

export function writeGeography(ctx: SeedContext) {
  const { media } = ctx;
  const sql = ctx.sql.section("geography");

  // flags and federation logos first: countries and federations point at them
  const flagOf = new Map<string, string>();
  const logoOf = new Map<string, string>();
  for (const c of countries) {
    const ref = COUNTRY_REFERENCE[c.code];
    if (!ref) throw new Error(`No reference data for ${c.code}`);
    flagOf.set(c.code, media.flag(ref.iso2, c.code).id);
    logoOf.set(c.code, media.federationLogo(`fed-${c.code}`, c.federation).id);
  }

  sql.comment("supported countries (admin-managed, like AfriScout's supported_countries)");
  sql.insert(
    "countries",
    ["code", "iso2", "name", "name_fr", "name_es", "name_de", "flag", "flag_media_id", "zone", "capital", "timezone", "currency", "active", "sync_source", "sync_health", "last_sync_hours"],
    countries.map((c) => {
      const ref = COUNTRY_REFERENCE[c.code];
      return [c.code, ref.iso2, c.name, c.nameFr, ref.nameEs, ref.nameDe, c.flag, flagOf.get(c.code)!, c.zone, c.capital, ref.timezone, ref.currency, true, c.syncSource, c.syncHealth, c.lastSyncHours];
    }),
  );

  sql.comment("one federation per supported country");
  sql.insert(
    "federations",
    ["id", "code", "name", "country", "status", "logo_media_id"],
    countries.map((c) => [`fed-${c.code}`, c.federation, COUNTRY_REFERENCE[c.code].federationName, c.code, "active", logoOf.get(c.code)!]),
  );

  sql.comment("competitions (≈ AfriScout leagues)");
  sql.insert(
    "competitions",
    ["id", "country_code", "name", "short_name", "tier", "gender", "season", "matchdays", "current_matchday", "var_enabled", "weight"],
    competitions.map((c) => [c.id, c.countryCode, c.name, c.shortName, c.tier, c.gender, SEASON, c.matchdays, c.currentMatchday, c.varEnabled, c.weight]),
  );

  // every stadium and club the facts know, with capacity, city, short name and home ground; national sides play at
  // their federation's national stadium
  for (const f of COUNTRY_FACTS) {
    for (const s of f.stadiums) ctx.stadiums.get(s.name, s.city, f.code, s.capacity);
    const home = (name: string) => {
      const s = f.stadiums.find((x) => x.name === name);
      if (!s) throw new Error(`${f.code}: no stadium named ${name}`);
      return ctx.stadiums.get(s.name, s.city, f.code, s.capacity);
    };
    for (const club of f.league.clubs) ctx.teams.get(club.name, f.code, "club", club.city, { shortName: club.short, stadiumId: home(club.stadium) });
    const national = f.stadiums.find((x) => x.name === f.nationalStadium)!;
    ctx.teams.get(f.name, f.code, "national", national.city, { shortName: f.code, stadiumId: home(f.nationalStadium) });
  }
}

/** Stadiums and teams, after fixtures and matches have named everything they need. */
export function writeTeams(ctx: SeedContext) {
  const { media } = ctx;
  const sql = ctx.sql.section("teams");
  sql.comment("stadiums");
  sql.insert("stadiums", ["id", "name", "city", "country", "capacity"], ctx.stadiums.rows.map((s) => [s.id, s.name, s.city, s.country, s.capacity]));

  const crestOf = new Map(ctx.teams.rows.map((t) => [t.id, media.crest(t.id, t.name).id]));
  sql.comment("teams (clubs and national sides)");
  sql.insert(
    "teams",
    ["id", "name", "short_name", "kind", "country", "city", "stadium_id", "logo_media_id"],
    ctx.teams.rows.map((t) => [t.id, t.name, t.shortName, t.kind, t.country, t.city, t.stadiumId, crestOf.get(t.id)!]),
  );
}
