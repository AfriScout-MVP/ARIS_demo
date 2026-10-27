// Row factories for tests. They write straight to D1 (bypassing the API) so a test starts from a known state.
import { env } from "cloudflare:workers";
import { hashPassword } from "../../src/lib/crypto";
import { PASSWORD, uid } from "./app";

const db = () => env.DB;
let isoCounter = 0;
/** A unique two-letter code per country created in a test file. */
const nextIso2 = () => {
  const n = isoCounter++;
  return String.fromCharCode(65 + (n % 26)) + String.fromCharCode(65 + (Math.floor(n / 26) % 26));
};

export async function addCountry(code: string, opts: { zone?: string; active?: boolean; timezone?: string; currency?: string } = {}) {
  await db()
    .prepare(
      `INSERT OR IGNORE INTO countries (code, iso2, name, name_fr, name_es, name_de, flag, zone, capital, timezone, currency, active, sync_source, sync_health)
       VALUES (?, ?, ?, ?, ?, ?, '🏳️', ?, 'Capital', ?, ?, ?, 'COMET', 'healthy')`,
    )
    .bind(code, nextIso2(), code, `${code} fr`, `${code} es`, `${code} de`, opts.zone ?? "UNAF", opts.timezone ?? "UTC", opts.currency ?? "XOF", opts.active === false ? 0 : 1)
    .run();
}

/** One federation per country (what the schema requires). Returns its id. */
export async function addFederation(country: string, code = `${country}FF`) {
  await addCountry(country);
  const id = `fed-${country}`;
  await db().prepare("INSERT OR IGNORE INTO federations (id, code, name, country) VALUES (?, ?, ?, ?)").bind(id, code, `Federation ${country}`, country).run();
  return id;
}

export async function addTeam(name: string, country: string, kind: "club" | "national" = "club") {
  await addCountry(country);
  const existing = await db().prepare("SELECT id FROM teams WHERE name = ? COLLATE NOCASE AND country = ? AND kind = ?").bind(name, country, kind).first<{ id: string }>();
  if (existing) return existing.id;
  const id = uid("team");
  await db().prepare("INSERT INTO teams (id, name, kind, country) VALUES (?, ?, ?, ?)").bind(id, name, kind, country).run();
  return id;
}

export async function addStadium(name: string, city: string, country: string) {
  const existing = await db().prepare("SELECT id FROM stadiums WHERE name = ? COLLATE NOCASE AND city = ? COLLATE NOCASE AND country = ?").bind(name, city, country).first<{ id: string }>();
  if (existing) return existing.id;
  const id = uid("stadium");
  await db().prepare("INSERT INTO stadiums (id, name, city, country) VALUES (?, ?, ?, ?)").bind(id, name, city, country).run();
  return id;
}

export async function addCompetition(id: string, country: string, opts: { tier?: string; varEnabled?: boolean; season?: string } = {}) {
  if (country !== "CAF") await addCountry(country);
  await db()
    .prepare("INSERT INTO competitions (id, country_code, name, tier, gender, season, matchdays, current_matchday, var_enabled, weight) VALUES (?, ?, ?, ?, 'M', ?, 30, 1, ?, 1)")
    .bind(id, country, `League ${id}`, opts.tier ?? "d1", opts.season ?? "2026/2027", opts.varEnabled ? 1 : 0)
    .run();
}

export async function addOfficial(
  id: string,
  country: string,
  o: { kind?: "referee" | "assistant"; status?: string; varQualified?: boolean; rating?: number } = {},
) {
  await addCountry(country);
  await db()
    .prepare(
      "INSERT INTO officials (id, kind, name, initials, country_code, level, status, var_qualified, rmcs_avg, fitness) VALUES (?, ?, ?, 'XX', ?, 'National D1', ?, ?, ?, 85)",
    )
    .bind(id, o.kind ?? "referee", `Official ${id}`, country, o.status ?? "active", o.varQualified ? 1 : 0, o.rating ?? 80)
    .run();
}

/**
 * A fixture and its empty slots. `home` / `away` are team names (created on demand in the fixture's country,
 * or as national sides when homeCode / awayCode are given for a continental tie).
 */
export async function addFixture(
  id: string,
  p: {
    country: string;
    competition: string;
    date: string;
    time?: string;
    home?: string;
    away?: string;
    homeCode?: string;
    awayCode?: string;
    roles?: string[];
    importance?: number;
    round?: number;
  },
) {
  const nations = p.homeCode && p.awayCode;
  const homeTeam = nations ? await addTeam(p.home ?? p.homeCode!, p.homeCode!, "national") : await addTeam(p.home ?? "Home FC", p.country);
  const awayTeam = nations ? await addTeam(p.away ?? p.awayCode!, p.awayCode!, "national") : await addTeam(p.away ?? "Away FC", p.country);
  await db()
    .prepare(
      "INSERT INTO fixtures (id, country_code, competition_id, round_no, home_team_id, away_team_id, kickoff_at, importance, risk) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'low')",
    )
    .bind(id, p.country, p.competition, p.round ?? 1, homeTeam, awayTeam, `${p.date}T${p.time ?? "18:00"}:00Z`, p.importance ?? 60)
    .run();
  for (const role of p.roles ?? ["R", "AR1", "AR2", "FOURTH"]) {
    await db().prepare("INSERT INTO designations (fixture_id, role, official_id, state) VALUES (?, ?, NULL, 'empty')").bind(id, role).run();
  }
}

/** An account. Federation seats and taggers need `federationId` (see addFederation); referees need `officialId`. */
export async function addUser(email: string, role: "admin" | "federation" | "referee" | "tagger", o: { officialId?: string; federationId?: string; locale?: string } = {}) {
  const id = uid("user");
  await db()
    .prepare("INSERT INTO users (id, email, name, role, official_id, federation_id, locale, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, email.split("@")[0], role, o.officialId ?? null, o.federationId ?? null, o.locale ?? "fr", await hashPassword(PASSWORD))
    .run();
  return id;
}

/** Shorthand: a federation of `country` with one seat. Returns { federationId, userId, email }. */
export async function addFederationSeat(country: string, email = `seat-${country.toLowerCase()}@aris.test`) {
  const federationId = await addFederation(country);
  const userId = await addUser(email, "federation", { federationId });
  return { federationId, userId, email };
}

export const sql = (q: string, ...args: (string | number | null)[]) => db().prepare(q).bind(...args);
