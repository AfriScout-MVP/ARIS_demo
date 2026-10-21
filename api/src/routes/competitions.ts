import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, uuid, type Ctx } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { CONTINENTAL, assertCountry, countryFilter } from "../lib/access";
import { currentUser, staff } from "../middleware/auth";

/** Competitions (AfriScout: leagues) — a competition and its season. Federations manage their own country's; admins any, incl. 'CAF'. */
export const competitions = new Hono<AppEnv>();
competitions.use("*", staff);

export interface CompetitionRow {
  id: string;
  country_code: string;
  name: string;
  short_name: string | null;
  tier: "d1" | "d2" | "cup" | "continental";
  gender: "M" | "W";
  season: string;
  matchdays: number;
  current_matchday: number;
  var_enabled: number;
  weight: number;
  is_active: number;
}

export const COMPETITION_SQL = "SELECT id, country_code, name, short_name, tier, gender, season, matchdays, current_matchday, var_enabled, weight, is_active FROM competitions";

/** The competition as the app's `Competition` type. */
export function competitionDto(r: CompetitionRow) {
  return {
    id: r.id,
    countryCode: r.country_code,
    name: r.name,
    shortName: r.short_name,
    tier: r.tier,
    gender: r.gender,
    season: r.season,
    matchdays: r.matchdays,
    currentMatchday: r.current_matchday,
    varEnabled: r.var_enabled === 1,
    weight: r.weight,
    isActive: r.is_active === 1,
  };
}

/** "YYYY/YYYY" with the second year following the first — the canonical season label. */
const seasonSchema = z
  .string()
  .regex(/^\d{4}\/\d{4}$/, "Use YYYY/YYYY")
  .refine((s) => Number(s.slice(5)) === Number(s.slice(0, 4)) + 1, "The second year must follow the first (2026/2027)");

const tierSchema = z.enum(["d1", "d2", "cup", "continental"]);

/** Continental competitions belong to 'CAF' and nothing else does. */
function assertTierMatchesCountry(tier: string, countryCode: string) {
  if ((tier === "continental") !== (countryCode === CONTINENTAL)) {
    throw new ApiError(422, "tier_country_mismatch", "A continental competition belongs to CAF, and CAF runs only continental competitions");
  }
}

function assertCounters(matchdays: number, current: number) {
  if (current > matchdays) throw new ApiError(422, "validation_failed", "currentMatchday cannot exceed matchdays", [{ path: "currentMatchday", message: "Cannot exceed matchdays" }]);
}

competitions.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ country: z.string().min(2).max(3).optional(), active: z.enum(["0", "1"]).optional() }));
  const scope = countryFilter(user, "country_code");
  const where = [scope.sql];
  const params: string[] = [...scope.params];
  // a federation is already confined to its own country; asking for another one finds nothing
  if (q.country) (where.push("country_code = ?"), params.push(q.country.toUpperCase()));
  if (q.active) (where.push("is_active = ?"), params.push(q.active));
  const { results } = await c.env.DB.prepare(`${COMPETITION_SQL} WHERE ${where.join(" AND ")} ORDER BY country_code, tier, name`)
    .bind(...params)
    .all<CompetitionRow>();
  return c.json({ competitions: results.map(competitionDto) });
});

async function loadOne(c: Ctx, id: string) {
  const row = await c.env.DB.prepare(`${COMPETITION_SQL} WHERE id = ?`).bind(id).first<CompetitionRow>();
  if (!row) throw notFound("Competition");
  assertCountry(currentUser(c), row.country_code, "Competition");
  return row;
}

competitions.get("/:id", async (c) => c.json({ competition: competitionDto(await loadOne(c, c.req.param("id"))) }));

const createSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "Lowercase letters, digits and dashes").optional(),
  /** A supported country's alpha-3 code, or 'CAF'. A federation can only use its own. */
  countryCode: z.string().length(3).transform((s) => s.toUpperCase()).optional(),
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(1).max(30).nullish(),
  tier: tierSchema,
  gender: z.enum(["M", "W"]).default("M"),
  season: seasonSchema,
  matchdays: z.number().int().min(1).max(100),
  currentMatchday: z.number().int().min(0).max(100).default(0),
  varEnabled: z.boolean().default(false),
  weight: z.number().min(0).max(10).default(1),
  isActive: z.boolean().default(true),
});

competitions.post("/", async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, createSchema);
  const db = c.env.DB;
  const countryCode = b.countryCode ?? (user.role === "federation" ? user.country! : undefined);
  if (!countryCode) throw new ApiError(422, "validation_failed", "Some fields are invalid", [{ path: "countryCode", message: "Required" }]);
  // 404 for a federation naming a country that is not its own (nor CAF): it learns nothing about it
  assertCountry(user, countryCode, "Country");
  if (countryCode !== CONTINENTAL) {
    const country = await db.prepare("SELECT active FROM countries WHERE code = ?").bind(countryCode).first<{ active: number }>();
    if (!country) throw new ApiError(422, "unknown_country", "Unknown country");
    if (country.active !== 1) throw new ApiError(409, "country_inactive", "This country is not a supported country");
  }
  assertTierMatchesCountry(b.tier, countryCode);
  assertCounters(b.matchdays, b.currentMatchday);

  const id = b.id ?? `cmp-${uuid().slice(0, 12)}`;
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO competitions (id, country_code, name, short_name, tier, gender, season, matchdays, current_matchday, var_enabled, weight, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, countryCode, b.name, b.shortName ?? null, b.tier, b.gender, b.season, b.matchdays, b.currentMatchday, b.varEnabled ? 1 : 0, b.weight, b.isActive ? 1 : 0),
      auditStmt(db, user, {
        action: "competition.create",
        entity: "competition",
        entityId: id,
        after: { name: b.name, tier: b.tier, season: b.season, countryCode },
        countryCode,
        ip: c.get("ip"),
      }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "A competition with this id already exists");
    throw err;
  }
  return c.json({ competition: competitionDto(await loadOne(c, id)) }, 201);
});

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    shortName: z.string().trim().min(1).max(30).nullable(),
    tier: tierSchema,
    matchdays: z.number().int().min(1).max(100),
    currentMatchday: z.number().int().min(0).max(100),
    varEnabled: z.boolean(),
    weight: z.number().min(0).max(10),
    isActive: z.boolean(),
  })
  .partial();

competitions.patch("/:id", async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, patchSchema);
  const db = c.env.DB;
  const row = await loadOne(c, c.req.param("id"));

  const tier = b.tier ?? row.tier;
  const matchdays = b.matchdays ?? row.matchdays;
  const current = b.currentMatchday ?? row.current_matchday;
  assertTierMatchesCountry(tier, row.country_code);
  assertCounters(matchdays, current);

  const cols: Array<[string, string | number | null]> = [];
  if (b.name !== undefined) cols.push(["name", b.name]);
  if (b.shortName !== undefined) cols.push(["short_name", b.shortName]);
  if (b.tier !== undefined) cols.push(["tier", b.tier]);
  if (b.matchdays !== undefined) cols.push(["matchdays", b.matchdays]);
  if (b.currentMatchday !== undefined) cols.push(["current_matchday", b.currentMatchday]);
  if (b.varEnabled !== undefined) cols.push(["var_enabled", b.varEnabled ? 1 : 0]);
  if (b.weight !== undefined) cols.push(["weight", b.weight]);
  if (b.isActive !== undefined) cols.push(["is_active", b.isActive ? 1 : 0]);
  if (cols.length === 0) return c.json({ competition: competitionDto(row) });

  await db.batch([
    db.prepare(`UPDATE competitions SET ${cols.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`).bind(...cols.map(([, v]) => v), row.id),
    auditStmt(db, user, {
      action: "competition.update",
      entity: "competition",
      entityId: row.id,
      before: competitionDto(row),
      after: b,
      countryCode: row.country_code,
      ip: c.get("ip"),
    }),
  ]);
  return c.json({ competition: competitionDto(await loadOne(c, row.id)) });
});
