import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, readJson, uuid } from "../lib/http";
import { hashPassword } from "../lib/crypto";
import { auditStmt } from "../lib/audit";
import { currentUser, requireRole } from "../middleware/auth";
import { passwordSchema } from "./auth";

export const users = new Hono<AppEnv>();
users.use("*", requireRole("admin"));

const roleSchema = z.enum(["admin", "commission", "observer", "referee"]);
const scopeSchema = z.string().regex(/^(all|zone:[A-Z0-9-]+|country:[A-Z]{3})$/, "Use all, zone:XXX or country:XXX");

const createSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(120),
  role: roleSchema,
  officialId: z.string().nullable().optional(),
  scope: scopeSchema.default("all"),
  locale: z.enum(["fr", "en"]).default("fr"),
  password: passwordSchema,
});

const COLUMNS = "id, email, name, role, official_id AS officialId, scope, locale, active, last_login_at AS lastLoginAt, created_at AS createdAt";

users.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM users ORDER BY created_at`).all();
  return c.json({ users: results });
});

users.post("/", async (c) => {
  const actor = currentUser(c);
  const body = await readJson(c, createSchema);
  if ((body.role === "referee" || body.role === "observer") && !body.officialId) {
    throw new ApiError(422, "official_required", "Referee and observer accounts must be linked to an official");
  }
  const id = uuid();
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare("INSERT INTO users (id, email, name, role, official_id, scope, locale, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, body.email, body.name, body.role, body.officialId ?? null, body.scope, body.locale, await hashPassword(body.password)),
      auditStmt(c.env.DB, actor, { action: "user.create", entity: "user", entityId: id, after: { email: body.email, role: body.role, scope: body.scope }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "email_taken", "An account with this e-mail already exists");
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_official", "That official does not exist");
    throw err;
  }
  const row = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first();
  return c.json({ user: row }, 201);
});

const patchSchema = z
  .object({
    name: z.string().min(1).max(120),
    role: roleSchema,
    officialId: z.string().nullable(),
    scope: scopeSchema,
    locale: z.enum(["fr", "en"]),
    active: z.boolean(),
  })
  .partial();

users.patch("/:id", async (c) => {
  const actor = currentUser(c);
  const id = c.req.param("id");
  const body = await readJson(c, patchSchema);
  const before = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first<{ role: string; active: number } & Record<string, unknown>>();
  if (!before) throw notFound("User");

  // The platform must always keep at least one active admin — and an admin cannot lock themselves out by accident.
  const losesAdmin = before.role === "admin" && (body.role && body.role !== "admin" || body.active === false);
  if (losesAdmin) {
    const others = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").bind(id).first<{ n: number }>();
    if (!others || others.n === 0) throw new ApiError(409, "last_admin", "At least one active administrator must remain");
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const map: Record<string, string> = { name: "name", role: "role", officialId: "official_id", scope: "scope", locale: "locale" };
  for (const [key, col] of Object.entries(map)) {
    const v = (body as Record<string, unknown>)[key];
    if (v !== undefined) (sets.push(`${col} = ?`), args.push(v as string | null));
  }
  if (body.active !== undefined) (sets.push("active = ?"), args.push(body.active ? 1 : 0));
  // Any change to who someone is or whether they may sign in ends their current sessions.
  if (body.role !== undefined || body.active !== undefined || body.scope !== undefined) sets.push("token_version = token_version + 1");
  if (sets.length === 0) return c.json({ user: before });

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(c.env.DB, actor, { action: "user.update", entity: "user", entityId: id, before, after: body, ip: c.get("ip") }),
  ]);
  const after = await c.env.DB.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return c.json({ user: after });
});

users.post("/:id/reset-password", async (c) => {
  const actor = currentUser(c);
  const id = c.req.param("id");
  const { password } = await readJson(c, z.object({ password: passwordSchema }));
  const exists = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE id = ?").bind(id).first();
  if (!exists) throw notFound("User");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").bind(await hashPassword(password), id),
    auditStmt(c.env.DB, actor, { action: "user.reset_password", entity: "user", entityId: id, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});
