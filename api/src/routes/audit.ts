import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { parseQuery } from "../lib/http";
import { countryFilter, isAdmin } from "../lib/access";
import { currentUser, staff } from "../middleware/auth";
import { json } from "../domain/mappers";

/**
 * The audit trail. An admin reads all of it; a federation seat reads only the rows tagged with its own country
 * (and never the addresses people connected from); a referee has no access.
 */
export const audit = new Hono<AppEnv>();
audit.use("*", staff);

audit.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({
    entity: z.string().max(40).optional(),
    entityId: z.string().max(120).optional(),
    actor: z.string().max(80).optional(),
    action: z.string().max(80).optional(),
    before: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }));
  const scope = countryFilter(user, "a.country_code");
  const where = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.entity) (where.push("a.entity = ?"), args.push(q.entity));
  if (q.entityId) (where.push("a.entity_id = ?"), args.push(q.entityId));
  if (q.actor) (where.push("a.actor_user_id = ?"), args.push(q.actor));
  if (q.action) (where.push("a.action LIKE ? ESCAPE '\\'"), args.push(`${q.action.replace(/[\\%_]/g, "\\$&")}%`));
  if (q.before) (where.push("a.id < ?"), args.push(q.before));
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.at, a.action, a.entity, a.entity_id AS entityId, a.actor_user_id AS actorId, u.name AS actorName, a.actor_role AS actorRole,
            a.country_code AS countryCode, a.before, a.after, a.reason, a.ip
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ?`,
  )
    .bind(...args, q.limit)
    .all<{ id: number; before: string | null; after: string | null; ip: string | null }>();
  const admin = isAdmin(user);
  return c.json({
    entries: results.map((r) => ({ ...r, ip: admin ? r.ip : null, before: json(r.before, null), after: json(r.after, null) })),
    nextBefore: results.length === q.limit ? results.at(-1)!.id : null,
  });
});
