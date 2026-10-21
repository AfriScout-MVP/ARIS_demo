import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, countryFilter } from "../lib/access";
import { commitMedia, readUpload } from "../lib/media";
import { mediaUrl } from "../domain/mappers";
import { currentUser, staff } from "../middleware/auth";

/**
 * Teams (clubs and national sides) and stadiums. Staff only; a federation seat works inside its own country,
 * an admin anywhere. A team or stadium of another country answers 404 to a federation seat.
 */
export const teams = new Hono<AppEnv>();
export const stadiums = new Hono<AppEnv>();
teams.use("*", staff);
stadiums.use("*", staff);

const country3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "ISO alpha-3 country code");

async function assertSupportedCountry(db: D1Database, code: string) {
  const row = await db.prepare("SELECT 1 AS x FROM countries WHERE code = ?").bind(code).first();
  if (!row) throw new ApiError(422, "unknown_country", "That country is not in the supported list");
}

/* ------------------------------------------------------------------ teams */

const TEAM_SQL = `SELECT t.id, t.name, t.short_name, t.kind, t.country, t.city, t.stadium_id, s.name AS stadium_name, t.logo_media_id, t.created_at
  FROM teams t LEFT JOIN stadiums s ON s.id = t.stadium_id`;

interface TeamRow {
  id: string;
  name: string;
  short_name: string | null;
  kind: "club" | "national";
  country: string;
  city: string | null;
  stadium_id: string | null;
  stadium_name: string | null;
  logo_media_id: string | null;
  created_at: string;
}

const presentTeam = (t: TeamRow) => ({
  id: t.id,
  name: t.name,
  shortName: t.short_name,
  kind: t.kind,
  country: t.country,
  city: t.city,
  stadiumId: t.stadium_id,
  stadiumName: t.stadium_name,
  logoUrl: mediaUrl(t.logo_media_id),
  createdAt: t.created_at,
});

const loadTeam = (db: D1Database, id: string) => db.prepare(`${TEAM_SQL} WHERE t.id = ?`).bind(id).first<TeamRow>();

teams.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ country: country3.optional(), kind: z.enum(["club", "national"]).optional() }));
  const scope = countryFilter(user, "t.country");
  const where = [scope.sql];
  const args: string[] = [...scope.params];
  if (q.country) (where.push("t.country = ?"), args.push(q.country));
  if (q.kind) (where.push("t.kind = ?"), args.push(q.kind));
  const { results } = await c.env.DB.prepare(`${TEAM_SQL} WHERE ${where.join(" AND ")} ORDER BY t.country, t.name COLLATE NOCASE`).bind(...args).all<TeamRow>();
  return c.json({ teams: results.map(presentTeam) });
});

const teamFields = {
  name: z.string().trim().min(2).max(100),
  shortName: z.string().trim().min(1).max(20).nullable(),
  kind: z.enum(["club", "national"]),
  city: z.string().trim().min(1).max(80).nullable(),
  stadiumId: z.string().min(1).max(80).nullable(),
};

/** A team's home ground must exist and belong to the team's own country. */
async function assertHomeGround(db: D1Database, stadiumId: string | null | undefined, country: string) {
  if (!stadiumId) return;
  const s = await db.prepare("SELECT country FROM stadiums WHERE id = ?").bind(stadiumId).first<{ country: string }>();
  if (!s || s.country !== country) throw new ApiError(422, "unknown_stadium", "That stadium does not exist in this country");
}

teams.post("/", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(c, z.object({ ...teamFields, shortName: teamFields.shortName.optional(), city: teamFields.city.optional(), stadiumId: teamFields.stadiumId.optional(), country: country3 }));
  assertCountry(actor, b.country, "Country");
  await assertSupportedCountry(db, b.country);
  await assertHomeGround(db, b.stadiumId, b.country);
  const id = uuid();
  try {
    await db.batch([
      db.prepare("INSERT INTO teams (id, name, short_name, kind, country, city, stadium_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, b.name, b.shortName ?? null, b.kind, b.country, b.city ?? null, b.stadiumId ?? null),
      auditStmt(db, actor, { action: "team.create", entity: "team", entityId: id, after: b, countryCode: b.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "team_exists", "This country already has a team with that name and kind");
    throw err;
  }
  return c.json({ team: presentTeam((await loadTeam(db, id))!) }, 201);
});

teams.patch("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, z.object(teamFields).partial().refine((x) => Object.keys(x).length > 0, "Nothing to change"));
  const before = await loadTeam(db, id);
  if (!before) throw notFound("Team");
  assertCountry(actor, before.country, "Team");
  await assertHomeGround(db, b.stadiumId, before.country);

  const cols: Record<string, string> = { name: "name", shortName: "short_name", kind: "kind", city: "city", stadiumId: "stadium_id" };
  const sets: string[] = [];
  const args: (string | null)[] = [];
  for (const [key, col] of Object.entries(cols)) {
    const v = (b as Record<string, unknown>)[key];
    if (v !== undefined) (sets.push(`${col} = ?`), args.push(v as string | null));
  }
  try {
    await db.batch([
      db.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
      auditStmt(db, actor, { action: "team.update", entity: "team", entityId: id, before: presentTeam(before), after: b, countryCode: before.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "team_exists", "This country already has a team with that name and kind");
    throw err;
  }
  return c.json({ team: presentTeam((await loadTeam(db, id))!) });
});

teams.put("/:id/logo", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const team = await loadTeam(db, id);
  if (!team) throw notFound("Team");
  assertCountry(actor, team.country, "Team");
  const { upload } = await readUpload(c, { imageOnly: true });
  await commitMedia(c.env, {
    upload,
    user: actor,
    ip: c.get("ip"),
    kind: "crest",
    visibility: "public",
    ownerType: "team",
    ownerId: id,
    replaces: [team.logo_media_id],
    then: (mediaId) => [db.prepare("UPDATE teams SET logo_media_id = ? WHERE id = ?").bind(mediaId, id)],
    audit: { action: "team.logo", entity: "team", entityId: id, countryCode: team.country },
  });
  return c.json({ team: presentTeam((await loadTeam(db, id))!) });
});

/* --------------------------------------------------------------- stadiums */

interface StadiumRow {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number | null;
  created_at: string;
}

const presentStadium = (s: StadiumRow) => ({ id: s.id, name: s.name, city: s.city, country: s.country, capacity: s.capacity, createdAt: s.created_at });
const loadStadium = (db: D1Database, id: string) => db.prepare("SELECT id, name, city, country, capacity, created_at FROM stadiums WHERE id = ?").bind(id).first<StadiumRow>();

stadiums.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ country: country3.optional() }));
  const scope = countryFilter(user, "country");
  const where = [scope.sql];
  const args: string[] = [...scope.params];
  if (q.country) (where.push("country = ?"), args.push(q.country));
  const { results } = await c.env.DB.prepare(`SELECT id, name, city, country, capacity, created_at FROM stadiums WHERE ${where.join(" AND ")} ORDER BY country, name COLLATE NOCASE`)
    .bind(...args)
    .all<StadiumRow>();
  return c.json({ stadiums: results.map(presentStadium) });
});

const stadiumFields = {
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(500_000).nullable(),
};

stadiums.post("/", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(c, z.object({ ...stadiumFields, capacity: stadiumFields.capacity.optional(), country: country3 }));
  assertCountry(actor, b.country, "Country");
  await assertSupportedCountry(db, b.country);
  const id = uuid();
  try {
    await db.batch([
      db.prepare("INSERT INTO stadiums (id, name, city, country, capacity) VALUES (?, ?, ?, ?, ?)").bind(id, b.name, b.city, b.country, b.capacity ?? null),
      auditStmt(db, actor, { action: "stadium.create", entity: "stadium", entityId: id, after: b, countryCode: b.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "stadium_exists", "This city already has a stadium with that name");
    throw err;
  }
  return c.json({ stadium: presentStadium((await loadStadium(db, id))!) }, 201);
});

stadiums.patch("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, z.object(stadiumFields).partial().refine((x) => Object.keys(x).length > 0, "Nothing to change"));
  const before = await loadStadium(db, id);
  if (!before) throw notFound("Stadium");
  assertCountry(actor, before.country, "Stadium");
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const key of ["name", "city", "capacity"] as const) {
    if (b[key] !== undefined) (sets.push(`${key} = ?`), args.push(b[key] as string | number | null));
  }
  try {
    await db.batch([
      db.prepare(`UPDATE stadiums SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
      auditStmt(db, actor, { action: "stadium.update", entity: "stadium", entityId: id, before: presentStadium(before), after: b, countryCode: before.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "stadium_exists", "This city already has a stadium with that name");
    throw err;
  }
  return c.json({ stadium: presentStadium((await loadStadium(db, id))!) });
});
