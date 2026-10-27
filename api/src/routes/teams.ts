import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, countryFilter } from "../lib/access";
import { commitMedia, deleteMedia, readUpload } from "../lib/media";
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

/** Search and paging shared by both lists: `q` matches the name or the city, `nextOffset` is null on the last page. */
const pageQuery = {
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

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
  const q = parseQuery(c, z.object({ country: country3.optional(), kind: z.enum(["club", "national"]).optional(), ...pageQuery }));
  const scope = countryFilter(user, "t.country");
  const where = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.country) (where.push("t.country = ?"), args.push(q.country));
  if (q.kind) (where.push("t.kind = ?"), args.push(q.kind));
  if (q.q) {
    const like = likeOf(q.q);
    where.push("(t.name LIKE ? ESCAPE '\\' OR t.short_name LIKE ? ESCAPE '\\' OR t.city LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  const { results } = await c.env.DB.prepare(`${TEAM_SQL} WHERE ${where.join(" AND ")} ORDER BY t.country, t.name COLLATE NOCASE, t.id LIMIT ? OFFSET ?`)
    .bind(...args, q.limit + 1, q.offset)
    .all<TeamRow>();
  const more = results.length > q.limit;
  return c.json({ teams: results.slice(0, q.limit).map(presentTeam), limit: q.limit, offset: q.offset, nextOffset: more ? q.offset + q.limit : null });
});

teams.get("/:id", async (c) => {
  const user = currentUser(c);
  const team = await loadTeam(c.env.DB, c.req.param("id"));
  if (!team) throw notFound("Team");
  assertCountry(user, team.country, "Team");
  return c.json({ team: presentTeam(team) });
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

// Removing a team entered by mistake. A team that has played or is scheduled stays: fixtures and matches are the
// record, so the answer is 409 with what still uses it (rename it instead, or remove those fixtures first).
teams.delete("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const team = await loadTeam(db, id);
  if (!team) throw notFound("Team");
  assertCountry(actor, team.country, "Team");
  const use = (await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM fixtures WHERE home_team_id = ?1 OR away_team_id = ?1) AS fixtures,
              (SELECT COUNT(*) FROM matches WHERE home_team_id = ?1 OR away_team_id = ?1) AS matches`,
    )
    .bind(id)
    .first<{ fixtures: number; matches: number }>())!;
  if (use.fixtures || use.matches) throw new ApiError(409, "in_use", "This team has fixtures or matches and cannot be deleted", use);
  const { results: media } = await db.prepare("SELECT id FROM media_assets WHERE owner_type = 'team' AND owner_id = ?").bind(id).all<{ id: string }>();
  await deleteMedia(c.env, media.map((m) => m.id), [
    db.prepare("DELETE FROM teams WHERE id = ?").bind(id),
    auditStmt(db, actor, { action: "team.delete", entity: "team", entityId: id, before: presentTeam(team), countryCode: team.country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

/* --------------------------------------------------------------- stadiums */

interface StadiumRow {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number | null;
  photo_media_id: string | null;
  created_at: string;
}

const STADIUM_COLS = "id, name, city, country, capacity, photo_media_id, created_at";
const presentStadium = (s: StadiumRow) => ({
  id: s.id,
  name: s.name,
  city: s.city,
  country: s.country,
  capacity: s.capacity,
  photoUrl: mediaUrl(s.photo_media_id),
  createdAt: s.created_at,
});
const loadStadium = (db: D1Database, id: string) => db.prepare(`SELECT ${STADIUM_COLS} FROM stadiums WHERE id = ?`).bind(id).first<StadiumRow>();

stadiums.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ country: country3.optional(), ...pageQuery }));
  const scope = countryFilter(user, "country");
  const where = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.country) (where.push("country = ?"), args.push(q.country));
  if (q.q) {
    const like = likeOf(q.q);
    where.push("(name LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')");
    args.push(like, like);
  }
  const { results } = await c.env.DB.prepare(`SELECT ${STADIUM_COLS} FROM stadiums WHERE ${where.join(" AND ")} ORDER BY country, name COLLATE NOCASE, id LIMIT ? OFFSET ?`)
    .bind(...args, q.limit + 1, q.offset)
    .all<StadiumRow>();
  const more = results.length > q.limit;
  return c.json({ stadiums: results.slice(0, q.limit).map(presentStadium), limit: q.limit, offset: q.offset, nextOffset: more ? q.offset + q.limit : null });
});

stadiums.get("/:id", async (c) => {
  const user = currentUser(c);
  const stadium = await loadStadium(c.env.DB, c.req.param("id"));
  if (!stadium) throw notFound("Stadium");
  assertCountry(user, stadium.country, "Stadium");
  return c.json({ stadium: presentStadium(stadium) });
});

// A picture of the ground (PNG, JPEG or WebP). Like a crest it is public — a stadium is not a person — and a new one
// replaces the previous file.
stadiums.put("/:id/photo", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const stadium = await loadStadium(db, id);
  if (!stadium) throw notFound("Stadium");
  assertCountry(actor, stadium.country, "Stadium");
  const { upload } = await readUpload(c, { imageOnly: true });
  await commitMedia(c.env, {
    upload,
    user: actor,
    ip: c.get("ip"),
    kind: "stadium",
    visibility: "public",
    ownerType: "stadium",
    ownerId: id,
    replaces: [stadium.photo_media_id],
    then: (mediaId) => [db.prepare("UPDATE stadiums SET photo_media_id = ? WHERE id = ?").bind(mediaId, id)],
    audit: { action: "stadium.photo", entity: "stadium", entityId: id, countryCode: stadium.country },
  });
  return c.json({ stadium: presentStadium((await loadStadium(db, id))!) });
});

stadiums.delete("/:id/photo", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const stadium = await loadStadium(db, id);
  if (!stadium) throw notFound("Stadium");
  assertCountry(actor, stadium.country, "Stadium");
  if (!stadium.photo_media_id) return c.json({ stadium: presentStadium(stadium) });
  await deleteMedia(c.env, [stadium.photo_media_id], [
    db.prepare("UPDATE stadiums SET photo_media_id = NULL WHERE id = ?").bind(id),
    auditStmt(db, actor, { action: "stadium.photo_delete", entity: "stadium", entityId: id, before: { mediaId: stadium.photo_media_id }, countryCode: stadium.country, ip: c.get("ip") }),
  ]);
  return c.json({ stadium: presentStadium((await loadStadium(db, id))!) });
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

// Removing a stadium entered by mistake. One that fixtures are played at stays (409 with the count); a team that
// only had it as home ground loses that link (the schema sets it to NULL) and the answer says how many.
stadiums.delete("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const stadium = await loadStadium(db, id);
  if (!stadium) throw notFound("Stadium");
  assertCountry(actor, stadium.country, "Stadium");
  const use = (await db
    .prepare("SELECT (SELECT COUNT(*) FROM fixtures WHERE stadium_id = ?1) AS fixtures, (SELECT COUNT(*) FROM teams WHERE stadium_id = ?1) AS teams")
    .bind(id)
    .first<{ fixtures: number; teams: number }>())!;
  if (use.fixtures) throw new ApiError(409, "in_use", "Fixtures are played at this stadium; it cannot be deleted", { fixtures: use.fixtures });
  const { results: media } = await db.prepare("SELECT id FROM media_assets WHERE owner_type = 'stadium' AND owner_id = ?").bind(id).all<{ id: string }>();
  await deleteMedia(c.env, media.map((m) => m.id), [
    db.prepare("DELETE FROM stadiums WHERE id = ?").bind(id),
    auditStmt(db, actor, { action: "stadium.delete", entity: "stadium", entityId: id, before: presentStadium(stadium), after: { homeGroundCleared: use.teams }, countryCode: stadium.country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, homeGroundCleared: use.teams });
});
