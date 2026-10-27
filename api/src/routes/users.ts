import { Hono } from "hono";
import { z } from "zod";
import { LOCALES, type AppEnv, type AuthUser } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { hashPassword } from "../lib/crypto";
import { auditStmt } from "../lib/audit";
import { countryFilter, inCountry, isAdmin } from "../lib/access";
import { currentUser, staff } from "../middleware/auth";
import { closeResetLinks, passwordSchema } from "./auth";

/**
 * Accounts. An admin manages everyone. A federation seat manages the REFEREE accounts of its own country
 * (list, create, activate / deactivate, rename, reset the password) and can only read the seats of its own federation.
 */
export const users = new Hono<AppEnv>();
users.use("*", staff);

const localeSchema = z.enum(LOCALES as [string, ...string[]]);
const roleSchema = z.enum(["admin", "federation", "referee", "tagger"]);

/** A user row as the API returns it. `country` is the federation's country, or the referee's own country. */
const SELECT = `SELECT u.id, u.email, u.name, u.role, u.official_id AS officialId, o.name AS officialName,
       u.federation_id AS federationId, f.code AS federationCode, COALESCE(f.country, o.country_code) AS country,
       u.locale, u.active, u.must_change_password AS mustChangePassword, u.last_login_at AS lastLoginAt, u.created_at AS createdAt
  FROM users u
  LEFT JOIN officials o ON o.id = u.official_id
  LEFT JOIN federations f ON f.id = u.federation_id`;

interface UserOut {
  id: string;
  email: string;
  name: string;
  role: "admin" | "federation" | "referee" | "tagger";
  officialId: string | null;
  officialName: string | null;
  federationId: string | null;
  federationCode: string | null;
  country: string | null;
  locale: string;
  active: boolean | number;
  mustChangePassword: boolean | number;
  lastLoginAt: string | null;
  createdAt: string;
}

const present = (r: UserOut) => ({
  ...r,
  active: r.active === 1 || r.active === true,
  mustChangePassword: r.mustChangePassword === 1 || r.mustChangePassword === true,
});

async function loadUser(db: D1Database, id: string) {
  const row = await db.prepare(`${SELECT} WHERE u.id = ?`).bind(id).first<UserOut>();
  return row ? present(row) : null;
}

/**
 * Whom the caller may see and how far their power over an account goes:
 *   admin       sees and writes everyone
 *   federation  sees the referee accounts of its country and the seats of its federation; writes only the referees
 * Anything outside the caller's country is "not found".
 */
function reach(actor: AuthUser, target: { role: string; country: string | null }) {
  if (isAdmin(actor)) return { visible: true, writable: true };
  const visible = inCountry(actor, target.country);
  return { visible, writable: visible && target.role === "referee" };
}

function assertWritable(actor: AuthUser, target: UserOut) {
  const r = reach(actor, target);
  if (!r.visible) throw notFound("User");
  if (!r.writable) throw forbidden("Only an administrator can change this account");
}

const listQuery = z.object({
  role: roleSchema.optional(),
  q: z.string().trim().max(80).optional(),
  country: z.string().length(3).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

users.get("/", async (c) => {
  const actor = currentUser(c);
  const q = parseQuery(c, listQuery);
  const scope = countryFilter(actor, "COALESCE(f.country, o.country_code)");
  const where = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.role) (where.push("u.role = ?"), args.push(q.role));
  if (q.country) (where.push("COALESCE(f.country, o.country_code) = ?"), args.push(q.country.toUpperCase()));
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')");
    args.push(like, like);
  }
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY u.created_at, u.id LIMIT ? OFFSET ?`)
    .bind(...args, q.limit, q.offset)
    .all<UserOut>();
  return c.json({ users: results.map(present), limit: q.limit, offset: q.offset });
});

const createSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(120),
  role: roleSchema,
  officialId: z.string().min(1).max(80).nullish(),
  federationId: z.string().min(1).max(80).nullish(),
  locale: localeSchema.default("fr"),
  password: passwordSchema,
});

/** The official / federation a link points at, with the country the account would be confined to. */
async function resolveLinks(db: D1Database, role: string, officialId: string | null, federationId: string | null) {
  if (role === "referee") {
    if (!officialId) throw new ApiError(422, "official_required", "A referee account must be linked to an official");
    if (federationId) throw new ApiError(422, "invalid_link", "A referee account cannot belong to a federation");
    const o = await db.prepare("SELECT id, country_code FROM officials WHERE id = ?").bind(officialId).first<{ id: string; country_code: string }>();
    if (!o) throw new ApiError(422, "unknown_official", "That official does not exist");
    return { country: o.country_code };
  }
  if (role === "federation" || role === "tagger") {
    if (!federationId) throw new ApiError(422, "federation_required", role === "tagger" ? "A tagger must belong to a federation" : "A federation seat must belong to a federation");
    if (officialId) throw new ApiError(422, "invalid_link", "This role cannot be linked to an official");
    const f = await db.prepare("SELECT id, country FROM federations WHERE id = ?").bind(federationId).first<{ id: string; country: string }>();
    if (!f) throw new ApiError(422, "unknown_federation", "That federation does not exist");
    return { country: f.country };
  }
  if (officialId || federationId) throw new ApiError(422, "invalid_link", "An administrator account has no official and no federation");
  return { country: null };
}

/** One account per official: a second account would double every notification and every sign-in. */
async function assertOfficialFree(db: D1Database, officialId: string, exceptUserId?: string) {
  const taken = await db
    .prepare("SELECT 1 AS x FROM users WHERE official_id = ? AND id <> ?")
    .bind(officialId, exceptUserId ?? "")
    .first();
  if (taken) throw new ApiError(409, "official_has_account", "This official already has an account");
}

// One account, under the same reach as the list: a federation seat reads its country's referees and its own
// federation's seats; anything else is "not found".
users.get("/:id", async (c) => {
  const actor = currentUser(c);
  const target = await loadUser(c.env.DB, c.req.param("id"));
  if (!target || !reach(actor, target).visible) throw notFound("User");
  return c.json({ user: target });
});

users.post("/", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const body = await readJson(c, createSchema);
  const officialId = body.officialId ?? null;
  const federationId = body.federationId ?? null;

  if (!isAdmin(actor)) {
    if (body.role !== "referee") throw forbidden("A federation can only create referee accounts");
    if (!officialId) throw new ApiError(422, "official_required", "A referee account must be linked to an official");
    // an official of another country does not exist as far as this seat is concerned
    const o = await db.prepare("SELECT country_code FROM officials WHERE id = ?").bind(officialId).first<{ country_code: string }>();
    if (!o || !inCountry(actor, o.country_code)) throw notFound("Official");
  }
  const { country } = await resolveLinks(db, body.role, officialId, federationId);
  if (officialId) await assertOfficialFree(db, officialId);

  const id = uuid();
  const email = body.email.toLowerCase();
  try {
    await db.batch([
      db
        // the password was chosen by the creator: its holder must replace it at first sign-in
        .prepare("INSERT INTO users (id, email, name, role, official_id, federation_id, locale, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)")
        .bind(id, email, body.name, body.role, officialId, federationId, body.locale, await hashPassword(body.password)),
      auditStmt(db, actor, {
        action: "user.create",
        entity: "user",
        entityId: id,
        after: { email, role: body.role, officialId, federationId },
        countryCode: country,
        ip: c.get("ip"),
      }),
    ]);
  } catch (err) {
    if (String(err).includes("users.email")) throw new ApiError(409, "email_taken", "An account with this e-mail already exists");
    throw err;
  }
  return c.json({ user: await loadUser(db, id) }, 201);
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    locale: localeSchema,
    active: z.boolean(),
    role: roleSchema,
    officialId: z.string().min(1).max(80).nullable(),
    federationId: z.string().min(1).max(80).nullable(),
  })
  .partial();

/** Rolls the whole batch back (and so refuses the change) if it would leave the platform without an active admin. */
const lastAdminGuard = (db: D1Database) =>
  db.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1) = 0 THEN json('last_admin') ELSE 1 END");

const isLastAdminError = (err: unknown) => /malformed JSON/i.test(String(err));

users.patch("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const body = await readJson(c, patchSchema);

  const before = await loadUser(db, id);
  if (!before) throw notFound("User");
  assertWritable(actor, before);

  // A federation seat may only change these three fields on a referee account.
  if (!isAdmin(actor)) {
    const extra = Object.keys(body).find((k) => !["name", "locale", "active"].includes(k));
    if (extra) throw forbidden(`Only an administrator can change "${extra}"`);
  }

  // Resolve the account's final shape and check it is consistent (the database CHECKs would refuse it too).
  const role = body.role ?? before.role;
  let officialId = body.officialId !== undefined ? body.officialId : before.officialId;
  let federationId = body.federationId !== undefined ? body.federationId : before.federationId;
  // changing the role drops the link the new role cannot have, unless the caller said otherwise
  if (role !== "referee" && body.officialId === undefined) officialId = null;
  if (role !== "federation" && role !== "tagger" && body.federationId === undefined) federationId = null;
  const identityChanged = role !== before.role || officialId !== before.officialId || federationId !== before.federationId;
  let country = before.country;
  if (identityChanged) {
    ({ country } = await resolveLinks(db, role, officialId, federationId));
    if (officialId && officialId !== before.officialId) await assertOfficialFree(db, officialId, id);
  }

  const losesAdmin = before.role === "admin" && before.active === true && (role !== "admin" || body.active === false);

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (body.name !== undefined) (sets.push("name = ?"), args.push(body.name));
  if (body.locale !== undefined) (sets.push("locale = ?"), args.push(body.locale));
  if (body.active !== undefined) (sets.push("active = ?"), args.push(body.active ? 1 : 0));
  if (identityChanged) sets.push("role = ?", "official_id = ?", "federation_id = ?"), args.push(role, officialId, federationId);
  if (sets.length === 0) return c.json({ user: before });
  // Whether someone may sign in, and who they are, changes at once: their sessions end.
  if (identityChanged || (body.active !== undefined && body.active !== before.active)) sets.push("token_version = token_version + 1");

  const stmts = [
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    ...(losesAdmin ? [lastAdminGuard(db)] : []),
    auditStmt(db, actor, { action: "user.update", entity: "user", entityId: id, before, after: body, countryCode: country, ip: c.get("ip") }),
  ];
  try {
    await db.batch(stmts);
  } catch (err) {
    if (isLastAdminError(err)) throw new ApiError(409, "last_admin", "At least one active administrator must remain");
    throw err;
  }
  return c.json({ user: await loadUser(db, id) });
});

users.post("/:id/reset-password", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const { password } = await readJson(c, z.object({ password: passwordSchema }));
  const target = await loadUser(db, id);
  if (!target) throw notFound("User");
  assertWritable(actor, target);
  await db.batch([
    // someone else now knows the password: it must be changed at the next sign-in; outstanding reset links die
    db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 1 WHERE id = ?").bind(await hashPassword(password), id),
    closeResetLinks(db, id),
    auditStmt(db, actor, { action: "user.reset_password", entity: "user", entityId: id, countryCode: target.country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

// Ends every session of an account at once — a lost phone, a shared laptop, a suspected break-in — without
// touching its password or locking it. Bumping token_version refuses every token issued before. Signing out
// one's own account this way is allowed too (the caller's session ends with the others).
users.post("/:id/sign-out", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const target = await loadUser(db, id);
  if (!target) throw notFound("User");
  if (target.id !== actor.id) assertWritable(actor, target);
  await db.batch([
    db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").bind(id),
    auditStmt(db, actor, { action: "user.sign_out_everywhere", entity: "user", entityId: id, countryCode: target.country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, self: target.id === actor.id });
});
