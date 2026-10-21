import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, AuthUser } from "../env";
import { ApiError, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { isAdmin } from "../lib/access";
import { commitMedia, readUpload } from "../lib/media";
import { mediaUrl } from "../domain/mappers";
import { currentUser, requireRole } from "../middleware/auth";

/**
 * The supported-countries list (the mirror of AfriScout's `supported_countries`). A country is "supported" while
 * `active = 1`: it has a federation portal and takes part in designations. Switching it off closes that portal at
 * once — the auth middleware refuses every seat of a federation whose country is inactive.
 */
export const countries = new Hono<AppEnv>();

export const ZONES = ["UNAF", "UFOA-A", "UFOA-B", "UNIFFAC", "CECAFA", "COSAFA"] as const;

const timezone = z.string().max(64).refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Unknown IANA time zone");

const federationCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "2-20 letters, digits or dashes");

const fields = {
  iso2: z.string().trim().toUpperCase().length(2).regex(/^[A-Z]{2}$/),
  name: z.string().trim().min(2).max(80),
  nameFr: z.string().trim().min(2).max(80),
  nameEs: z.string().trim().min(2).max(80),
  nameDe: z.string().trim().min(2).max(80),
  zone: z.enum(ZONES),
  capital: z.string().trim().min(1).max(80),
  timezone,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  flag: z.string().max(16),
};

const createSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "ISO 3166-1 alpha-3"),
  iso2: fields.iso2,
  name: fields.name,
  nameFr: fields.nameFr.optional(),
  nameEs: fields.nameEs.optional(),
  nameDe: fields.nameDe.optional(),
  zone: fields.zone,
  capital: fields.capital,
  timezone: fields.timezone.default("UTC"),
  currency: fields.currency.default("XOF"),
  flag: fields.flag.default(""),
  federation: z.object({ code: federationCode, name: z.string().trim().min(2).max(120) }).optional(),
});

const patchSchema = z
  .object({ ...fields, active: z.boolean() })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

export interface CountryRow {
  code: string;
  iso2: string;
  name: string;
  name_fr: string;
  name_es: string;
  name_de: string;
  flag: string;
  flag_media_id: string | null;
  zone: string;
  capital: string;
  timezone: string;
  currency: string;
  active: number;
  sync_source: string;
  sync_health: string;
  last_sync_hours: number;
  fed_code: string | null;
  fed_name: string | null;
}

export const COUNTRY_SQL = `SELECT c.code, c.iso2, c.name, c.name_fr, c.name_es, c.name_de, c.flag, c.flag_media_id, c.zone, c.capital, c.timezone,
       c.currency, c.active, c.sync_source, c.sync_health, c.last_sync_hours, f.code AS fed_code, f.name AS fed_name
  FROM countries c LEFT JOIN federations f ON f.country = c.code`;

/** The `Country` of the snapshot. Sync internals are only for admins and the country's own federation. */
export function toCountry(r: CountryRow, clubs: string[], viewer: AuthUser | null) {
  const internals = viewer && (isAdmin(viewer) || (viewer.role === "federation" && viewer.country === r.code));
  return {
    code: r.code,
    iso2: r.iso2,
    name: r.name,
    nameFr: r.name_fr,
    nameEs: r.name_es,
    nameDe: r.name_de,
    flag: r.flag,
    flagUrl: mediaUrl(r.flag_media_id),
    federation: r.fed_code,
    federationName: r.fed_name,
    zone: r.zone,
    capital: r.capital,
    timezone: r.timezone,
    currency: r.currency,
    active: r.active === 1,
    clubs,
    ...(internals ? { syncSource: r.sync_source, syncHealth: r.sync_health, lastSyncHours: r.last_sync_hours } : {}),
  };
}

async function clubsByCountry(db: D1Database, code?: string) {
  const { results } = await db
    .prepare(`SELECT country, name FROM teams WHERE kind = 'club' ${code ? "AND country = ?" : ""} ORDER BY name COLLATE NOCASE`)
    .bind(...(code ? [code] : []))
    .all<{ country: string; name: string }>();
  const map = new Map<string, string[]>();
  for (const t of results) (map.get(t.country) ?? map.set(t.country, []).get(t.country)!).push(t.name);
  return map;
}

async function loadCountry(db: D1Database, code: string, viewer: AuthUser | null) {
  const row = await db.prepare(`${COUNTRY_SQL} WHERE c.code = ?`).bind(code).first<CountryRow>();
  if (!row) return null;
  return toCountry(row, (await clubsByCountry(db, code)).get(code) ?? [], viewer);
}

countries.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ all: z.enum(["1", "0"]).optional() }));
  const includeInactive = isAdmin(user) && q.all === "1";
  const [{ results }, clubs] = await Promise.all([
    c.env.DB.prepare(`${COUNTRY_SQL} ${includeInactive ? "" : "WHERE c.active = 1"} ORDER BY c.name COLLATE NOCASE`).all<CountryRow>(),
    clubsByCountry(c.env.DB),
  ]);
  return c.json({ countries: results.map((r) => toCountry(r, clubs.get(r.code) ?? [], user)) });
});

countries.post("/", requireRole("admin"), async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(c, createSchema);

  const clash = await db.prepare("SELECT code, iso2 FROM countries WHERE code = ? OR iso2 = ?").bind(b.code, b.iso2).first<{ code: string; iso2: string }>();
  if (clash) throw new ApiError(409, "country_exists", clash.code === b.code ? "This country is already in the list" : "This ISO alpha-2 code is already used");
  if (b.federation) {
    const taken = await db.prepare("SELECT 1 AS x FROM federations WHERE code = ?").bind(b.federation.code).first();
    if (taken) throw new ApiError(409, "federation_code_taken", "A federation with this code already exists");
  }

  const fedId = b.federation ? uuid() : null;
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO countries (code, iso2, name, name_fr, name_es, name_de, flag, zone, capital, timezone, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(b.code, b.iso2, b.name, b.nameFr ?? b.name, b.nameEs ?? b.name, b.nameDe ?? b.name, b.flag, b.zone, b.capital, b.timezone, b.currency),
      ...(b.federation && fedId
        ? [db.prepare("INSERT INTO federations (id, code, name, country) VALUES (?, ?, ?, ?)").bind(fedId, b.federation.code, b.federation.name, b.code)]
        : []),
      auditStmt(db, actor, { action: "country.create", entity: "country", entityId: b.code, after: { ...b, federation: b.federation ?? null }, countryCode: b.code, ip: c.get("ip") }),
      ...(b.federation && fedId
        ? [auditStmt(db, actor, { action: "federation.create", entity: "federation", entityId: fedId, after: { ...b.federation, country: b.code }, countryCode: b.code, ip: c.get("ip") })]
        : []),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "country_exists", "This country is already in the list");
    throw err;
  }
  return c.json({ country: await loadCountry(db, b.code, actor) }, 201);
});

countries.patch("/:code", requireRole("admin"), async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const code = c.req.param("code").toUpperCase();
  const b = await readJson(c, patchSchema);
  const before = await db.prepare(`${COUNTRY_SQL} WHERE c.code = ?`).bind(code).first<CountryRow>();
  if (!before) throw notFound("Country");

  const cols: Record<string, string> = {
    iso2: "iso2", name: "name", nameFr: "name_fr", nameEs: "name_es", nameDe: "name_de", flag: "flag", zone: "zone",
    capital: "capital", timezone: "timezone", currency: "currency",
  };
  const sets: string[] = [];
  const args: (string | number)[] = [];
  for (const [key, col] of Object.entries(cols)) {
    const v = (b as Record<string, unknown>)[key];
    if (v !== undefined) (sets.push(`${col} = ?`), args.push(v as string));
  }
  if (b.active !== undefined) (sets.push("active = ?"), args.push(b.active ? 1 : 0));

  const action = b.active === undefined || (b.active ? 1 : 0) === before.active ? "country.update" : b.active ? "country.activate" : "country.deactivate";
  try {
    await db.batch([
      db.prepare(`UPDATE countries SET ${sets.join(", ")} WHERE code = ?`).bind(...args, code),
      auditStmt(db, actor, {
        action,
        entity: "country",
        entityId: code,
        before: { name: before.name, iso2: before.iso2, zone: before.zone, timezone: before.timezone, currency: before.currency, active: before.active === 1 },
        after: b,
        countryCode: code,
        ip: c.get("ip"),
      }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "country_exists", "This ISO alpha-2 code is already used");
    throw err;
  }
  return c.json({ country: await loadCountry(db, code, actor) });
});

countries.put("/:code/flag", requireRole("admin"), async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const code = c.req.param("code").toUpperCase();
  const country = await db.prepare("SELECT code, flag_media_id FROM countries WHERE code = ?").bind(code).first<{ code: string; flag_media_id: string | null }>();
  if (!country) throw notFound("Country");
  const { upload } = await readUpload(c, { imageOnly: true });
  await commitMedia(c.env, {
    upload,
    user: actor,
    ip: c.get("ip"),
    kind: "flag",
    visibility: "public",
    ownerType: "country",
    ownerId: code,
    replaces: [country.flag_media_id],
    then: (id) => [db.prepare("UPDATE countries SET flag_media_id = ? WHERE code = ?").bind(id, code)],
    audit: { action: "country.flag", entity: "country", entityId: code, countryCode: code },
  });
  return c.json({ country: await loadCountry(db, code, actor) });
});
