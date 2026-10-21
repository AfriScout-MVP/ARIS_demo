// Scenario builders for the evaluation / money / discipline / training / reports tests.
// Two countries, each with a federation seat, a competition and a few officials; rows are written straight to D1.
import { addCompetition, addFederationSeat, addFixture, addOfficial, addUser, api, login, sql, uid, type Session } from "./index";

export const GRID = [
  { key: "positioning", label: { fr: "Positionnement", en: "Positioning" }, weight: 20 },
  { key: "decisions", label: { fr: "Décisions", en: "Decisions" }, weight: 25 },
  { key: "gameManagement", label: { fr: "Gestion du jeu", en: "Game management" }, weight: 20 },
  { key: "discipline", label: { fr: "Discipline", en: "Discipline" }, weight: 15 },
  { key: "teamwork", label: { fr: "Communication", en: "Communication" }, weight: 10 },
  { key: "fitness", label: { fr: "Condition physique", en: "Fitness" }, weight: 10 },
];
/** Weighted: 8*.20 + 9*.25 + 7*.20 + 8*.15 + 6*.10 + 10*.10 = 8.05 → 8.1 */
export const MARKS = { positioning: 8, decisions: 9, gameManagement: 7, discipline: 8, teamwork: 6, fitness: 10 };

export interface World {
  a: string;
  b: string;
  admin: Session;
  seatA: Session;
  seatB: Session;
  /** referee accounts: A1 and A2 are referees of country A, OBS is an official of A used as match observer, B1 belongs to B */
  refA1: Session;
  refA2: Session;
  obsA: Session;
  refB1: Session;
  fedA: string;
  fedB: string;
}

/** Officials: `${a}-ref1`, `${a}-ref2`, `${a}-obs`, `${a}-as1..3` and `${b}-ref1`, `${b}-obs`. Competitions: `${a}-d1`, `${a}-cup`, `${b}-d1`. */
export async function makeWorld(a: string, b: string): Promise<World> {
  const tag = (c: string) => c.toLowerCase();
  const seatA = await addFederationSeat(a, `seat-${tag(a)}@aris.test`);
  const seatB = await addFederationSeat(b, `seat-${tag(b)}@aris.test`);
  await addCompetition(`${a}-d1`, a);
  await addCompetition(`${a}-cup`, a, { tier: "cup" });
  await addCompetition(`${b}-d1`, b);
  for (const [id, country, kind] of [
    [`${a}-ref1`, a, "referee"], [`${a}-ref2`, a, "referee"], [`${a}-obs`, a, "referee"],
    [`${a}-as1`, a, "assistant"], [`${a}-as2`, a, "assistant"], [`${a}-as3`, a, "assistant"],
    [`${b}-ref1`, b, "referee"], [`${b}-obs`, b, "referee"],
  ] as const) {
    await addOfficial(id, country, { kind });
  }
  await addUser(`admin-${tag(a)}@aris.test`, "admin");
  await addUser(`${tag(a)}-ref1@aris.test`, "referee", { officialId: `${a}-ref1` });
  await addUser(`${tag(a)}-ref2@aris.test`, "referee", { officialId: `${a}-ref2` });
  await addUser(`${tag(a)}-obs@aris.test`, "referee", { officialId: `${a}-obs` });
  await addUser(`${tag(b)}-ref1@aris.test`, "referee", { officialId: `${b}-ref1` });
  const [admin, sA, sB, refA1, refA2, obsA, refB1] = await Promise.all(
    [`admin-${tag(a)}`, `seat-${tag(a)}`, `seat-${tag(b)}`, `${tag(a)}-ref1`, `${tag(a)}-ref2`, `${tag(a)}-obs`, `${tag(b)}-ref1`].map((n) => login(`${n}@aris.test`)),
  );
  const grid = await api("PUT", "/api/v1/evaluation-criteria", { session: admin, body: { criteria: GRID } });
  if (grid.status !== 200) throw new Error(`grid: ${grid.text}`);
  return { a, b, admin, seatA: sA, seatB: sB, refA1, refA2, obsA, refB1, fedA: seatA.federationId, fedB: seatB.federationId };
}

let n = 0;
const pastDate = () => new Date(Date.UTC(2020, 0, 1 + (n += 3))).toISOString().slice(0, 10);

/**
 * A played match: fixture with its crew confirmed, designations validated, the fixture marked played and the
 * AfriScout-shaped `matches` row (+ its officiating analytics row) written. `crew` maps role → official id.
 */
export async function addPlayedMatch(p: {
  country: string;
  competition: string;
  referee: string;
  crew?: Record<string, string>;
  designationStatus?: "validated" | "published" | "draft";
  analyticsArps?: number;
  /** A continental tie between two national sides (country codes); `country` is then "CAF". */
  nations?: [string, string];
}) {
  const fixtureId = uid("pm");
  const date = pastDate();
  await addFixture(fixtureId, { country: p.country, competition: p.competition, date, round: n, roles: ["R", "AR1", "AR2", "FOURTH", "OBS"], ...(p.nations ? { homeCode: p.nations[0], awayCode: p.nations[1] } : {}) });
  const crew = { R: p.referee, ...(p.crew ?? {}) };
  for (const [role, officialId] of Object.entries(crew)) {
    await sql("UPDATE designations SET official_id = ?, state = 'confirmed' WHERE fixture_id = ? AND role = ?", officialId, fixtureId, role).run();
  }
  await sql("UPDATE fixtures SET designation_status = ?, status = 'played' WHERE id = ?", p.designationStatus ?? "validated", fixtureId).run();
  const fx = (await sql("SELECT home_team_id AS h, away_team_id AS a, kickoff_at AS k, competition_id AS c FROM fixtures WHERE id = ?", fixtureId).first<{ h: string; a: string; k: string; c: string }>())!;
  const matchId = `m-${fixtureId}`;
  await sql(
    `INSERT INTO matches (id, league_id, season, matchday, home_team_id, away_team_id, match_date, home_score, away_score, status, fixture_id, referee_id)
     VALUES (?, ?, '2026/2027', '1', ?, ?, ?, 2, 1, 'finished', ?, ?)`,
    matchId, fx.c, fx.h, fx.a, fx.k, fixtureId, p.referee,
  ).run();
  await sql("INSERT INTO match_officiating (match_id, arps_for_match, rmcs, pressure_avg) VALUES (?, ?, 0, 0)", matchId, p.analyticsArps ?? 0).run();
  return { fixtureId, matchId };
}

export const official = async (id: string) => (await sql("SELECT * FROM officials WHERE id = ?", id).first<Record<string, any>>())!;

export const get = (s: Session | null, path: string) => api("GET", `/api/v1${path}`, { session: s });
export const post = (s: Session | null, path: string, body?: object) => api("POST", `/api/v1${path}`, { session: s, body });
export const put = (s: Session | null, path: string, body?: object) => api("PUT", `/api/v1${path}`, { session: s, body });
export const patch = (s: Session | null, path: string, body?: object) => api("PATCH", `/api/v1${path}`, { session: s, body });
