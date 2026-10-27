import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, AuthUser } from "../env";
import { ApiError, notFound, parseQuery } from "../lib/http";
import { currentUser } from "../middleware/auth";
import { json } from "../domain/mappers";
import { outbox } from "./outbox";

export const notifications = new Hono<AppEnv>();

// The delivery queue (administrators), before the "/:id" routes.
notifications.route("/outbox", outbox);

/**
 * Whether a notification `n` is visible to the caller. Parameters ?1..?4 are `visibilityArgs(user)`:
 *   ?1 user id · ?2 role · ?3 federation country · ?4 official id (referees)
 * A notification is mine when
 *   - it is addressed to me, or
 *   - it is addressed to my role AND is not narrowed to another country (a federation seat's country is its own;
 *     a referee's is their official's; an admin is not confined to a country), or
 *   - I am an admin and it is addressed to federations (admins see what the federations are told).
 */
export const VISIBLE_SQL = `(n.user_id = ?1
  OR (n.audience_role = ?2 AND (?2 = 'admin' OR n.country_code IS NULL
       OR n.country_code = COALESCE(?3, (SELECT o.country_code FROM officials o WHERE o.id = ?4))))
  OR (?2 = 'admin' AND n.audience_role = 'federation'))`;

export const visibilityArgs = (u: AuthUser) => [u.id, u.role, u.country, u.officialId];

/** A page boundary: the last row's creation instant and rowid, opaque to the client. */
const encodeCursor = (createdAt: string, rowid: number) => btoa(`${createdAt}|${rowid}`).replace(/=+$/, "");
function decodeCursor(cursor: string) {
  try {
    const [createdAt, rowid] = atob(cursor).split("|");
    if (!createdAt || !/^\d+$/.test(rowid ?? "")) throw new Error("bad");
    return { createdAt, rowid: Number(rowid) };
  } catch {
    throw new ApiError(422, "validation_failed", "Invalid cursor", [{ path: "cursor", message: "Invalid cursor" }]);
  }
}

/** Not removed by this person from their own list. */
const NOT_DISMISSED = "COALESCE(r.dismissed, 0) = 0";

notifications.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(
    c,
    z.object({
      unread: z.enum(["1", "0"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
      cursor: z.string().min(1).max(200).optional(),
    }),
  );
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.rowid AS rid, n.title, n.detail, n.tone, n.href, n.created_at AS createdAt, (r.user_id IS NOT NULL) AS read
       FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1
      WHERE ${VISIBLE_SQL} AND ${NOT_DISMISSED} ${q.unread === "1" ? "AND r.user_id IS NULL" : ""}
        ${after ? "AND (n.created_at < ?6 OR (n.created_at = ?6 AND n.rowid < ?7))" : ""}
      ORDER BY n.created_at DESC, n.rowid DESC LIMIT ?5`,
  )
    .bind(...visibilityArgs(user), q.limit + 1, ...(after ? [after.createdAt, after.rowid] : []))
    .all<{ id: string; rid: number; title: string; detail: string; tone: string; href: string; createdAt: string; read: number }>();
  const page = results.slice(0, q.limit);
  const last = page[page.length - 1];
  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1 WHERE ${VISIBLE_SQL} AND r.user_id IS NULL`,
  )
    .bind(...visibilityArgs(user))
    .first<{ n: number }>();
  return c.json({
    unread: unread?.n ?? 0,
    notifications: page.map(({ rid: _rid, ...r }) => ({ ...r, title: json(r.title, {}), detail: json(r.detail, {}), read: r.read === 1 })),
    nextCursor: results.length > q.limit && last ? encodeCursor(last.createdAt, last.rid) : null,
  });
});

notifications.post("/read-all", async (c) => {
  const user = currentUser(c);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
       SELECT n.id, ?1 FROM notifications n WHERE ${VISIBLE_SQL}`,
  )
    .bind(...visibilityArgs(user))
    .run();
  return c.json({ ok: true });
});

notifications.post("/:id/read", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const mine = await c.env.DB.prepare(`SELECT 1 AS x FROM notifications n WHERE n.id = ?5 AND ${VISIBLE_SQL}`)
    .bind(...visibilityArgs(user), id)
    .first();
  if (!mine) throw notFound("Notification");
  await c.env.DB.prepare("INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)").bind(id, user.id).run();
  return c.json({ ok: true });
});

// Removes a notification from the caller's own list. A role-wide notice is shared, so it is hidden for this person
// only (and counts as read); what someone else can see is untouched. Anything not visible to the caller is "not found".
notifications.delete("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const mine = await c.env.DB.prepare(
    `SELECT 1 AS x FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1
      WHERE n.id = ?5 AND ${VISIBLE_SQL} AND ${NOT_DISMISSED}`,
  )
    .bind(...visibilityArgs(user), id)
    .first();
  if (!mine) throw notFound("Notification");
  await c.env.DB.prepare(
    "INSERT INTO notification_reads (notification_id, user_id, dismissed) VALUES (?, ?, 1) ON CONFLICT (notification_id, user_id) DO UPDATE SET dismissed = 1",
  )
    .bind(id, user.id)
    .run();
  return c.json({ ok: true });
});
