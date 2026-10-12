import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { notFound, parseQuery } from "../lib/http";
import { currentUser } from "../middleware/auth";
import { json } from "../domain/mappers";

export const notifications = new Hono<AppEnv>();

// A notification is mine when it is addressed to me, or to my role.
const MINE = "(n.user_id = ?1 OR n.audience_role = ?2)";

notifications.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ unread: z.enum(["1", "0"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }));
  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.detail, n.tone, n.href, n.created_at AS createdAt, (r.user_id IS NOT NULL) AS read
       FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1
      WHERE ${MINE} ${q.unread === "1" ? "AND r.user_id IS NULL" : ""}
      ORDER BY n.created_at DESC, n.rowid DESC LIMIT ?3`,
  )
    .bind(user.id, user.role, q.limit)
    .all<{ id: string; title: string; detail: string; tone: string; href: string; createdAt: string; read: number }>();
  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1 WHERE ${MINE} AND r.user_id IS NULL`,
  )
    .bind(user.id, user.role)
    .first<{ n: number }>();
  return c.json({
    unread: unread?.n ?? 0,
    notifications: results.map((r) => ({ ...r, title: json(r.title, {}), detail: json(r.detail, {}), read: r.read === 1 })),
  });
});

notifications.post("/read-all", async (c) => {
  const user = currentUser(c);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
       SELECT n.id, ?1 FROM notifications n WHERE ${MINE}`,
  )
    .bind(user.id, user.role)
    .run();
  return c.json({ ok: true });
});

notifications.post("/:id/read", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const mine = await c.env.DB.prepare(`SELECT 1 AS x FROM notifications n WHERE n.id = ?3 AND ${MINE}`).bind(user.id, user.role, id).first();
  if (!mine) throw notFound("Notification");
  await c.env.DB.prepare("INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)").bind(id, user.id).run();
  return c.json({ ok: true });
});
