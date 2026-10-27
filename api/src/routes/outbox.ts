import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { countryFilter } from "../lib/access";
import { drainOutbox } from "../lib/notify";
import { currentUser, requireRole, staff } from "../middleware/auth";
import { json } from "../domain/mappers";

/**
 * The e-mail / SMS / WhatsApp delivery queue, for whoever has to see why a message did not arrive.
 * An administrator reads every message and may requeue a failed or dead one. A federation seat reads the messages
 * meant for accounts of its own country (its seats, its referees) and changes nothing.
 * The body of a direct message (a reset link) is never returned.
 */
export const outbox = new Hono<AppEnv>();
outbox.use("*", staff);

const STATUSES = ["queued", "sent", "failed", "dead"] as const;

/** The country a message belongs to: its recipient account's (federation, else official), else its notice's. */
const COUNTRY = "COALESCE(f.country, off.country_code, n.country_code)";
const FROM = `FROM notification_outbox o
  LEFT JOIN notifications n ON n.id = o.notification_id
  LEFT JOIN users u ON u.id = COALESCE(o.user_id, n.user_id)
  LEFT JOIN federations f ON f.id = u.federation_id
  LEFT JOIN officials off ON off.id = u.official_id`;
const SELECT = `SELECT o.id, o.channel, o.recipient, o.status, o.attempts, o.last_error AS lastError, o.next_attempt_at AS nextAttemptAt,
       o.expires_at AS expiresAt, o.created_at AS createdAt, o.sent_at AS sentAt, o.notification_id AS notificationId,
       o.subject, n.title, u.id AS userId, u.name AS userName, ${COUNTRY} AS country ${FROM}`;

interface Row {
  id: number;
  channel: string;
  recipient: string;
  status: (typeof STATUSES)[number];
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  sentAt: string | null;
  notificationId: string | null;
  subject: string | null;
  title: string | null;
  userId: string | null;
  userName: string | null;
  country: string | null;
}

const present = ({ title, notificationId, ...r }: Row) => ({
  ...r,
  kind: notificationId ? ("notification" as const) : ("direct" as const),
  notificationId,
  title: title ? json(title, {}) : null,
});

outbox.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(
    c,
    z.object({
      status: z.enum(STATUSES).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.coerce.number().int().min(1).optional(),
    }),
  );
  const scope = countryFilter(user, COUNTRY);
  const where = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.status) (where.push("o.status = ?"), args.push(q.status));
  if (q.cursor) (where.push("o.id < ?"), args.push(q.cursor));
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY o.id DESC LIMIT ?`)
    .bind(...args, q.limit + 1)
    .all<Row>();
  const page = results.slice(0, q.limit);
  const counts = await c.env.DB.prepare(`SELECT o.status, COUNT(*) AS n ${FROM} WHERE ${scope.sql} GROUP BY o.status`)
    .bind(...scope.params)
    .all<{ status: Row["status"]; n: number }>();
  return c.json({
    messages: page.map(present),
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.results.find((r) => r.status === s)?.n ?? 0])),
    nextCursor: results.length > q.limit ? page[page.length - 1].id : null,
  });
});

// Requeue a message that failed or was given up: it is tried again at once with a fresh retry budget.
outbox.post("/:id/retry", requireRole("admin"), async (c) => {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id < 1) throw notFound("Message");
  const db = c.env.DB;
  const row = await db.prepare(`${SELECT} WHERE o.id = ?`).bind(id).first<Row>();
  if (!row) throw notFound("Message");
  if (row.status === "sent") throw new ApiError(409, "already_sent", "This message was delivered; it is not sent twice");
  if (row.status === "queued") throw new ApiError(409, "already_queued", "This message is already waiting to be sent");
  const content = await db.prepare("SELECT notification_id IS NOT NULL OR body IS NOT NULL AS deliverable FROM notification_outbox WHERE id = ?").bind(id).first<{ deliverable: number }>();
  if (!content?.deliverable || (row.expiresAt && row.expiresAt <= new Date().toISOString())) {
    throw new ApiError(409, "expired", "This message carried a link that has expired; it cannot be sent again");
  }
  await db.batch([
    db.prepare("UPDATE notification_outbox SET status = 'queued', attempts = 0, next_attempt_at = NULL WHERE id = ?").bind(id),
    auditStmt(db, user, { action: "outbox.retry", entity: "notification_outbox", entityId: String(id), before: { status: row.status, attempts: row.attempts }, countryCode: row.country, ip: c.get("ip") }),
  ]);
  try {
    c.executionCtx.waitUntil(drainOutbox(c.env, { ids: [id] }).catch(() => undefined));
  } catch {
    /* no execution context: the cron sends it */
  }
  const after = await db.prepare(`${SELECT} WHERE o.id = ?`).bind(id).first<Row>();
  return c.json({ message: present(after!) });
});
