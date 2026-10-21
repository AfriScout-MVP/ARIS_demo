import type { Env } from "../env";
import { uuid } from "./http";
import type { Localized } from "./localized";

export type Bilingual = Localized;

export interface NotificationInput {
  /** One account … */
  userId?: string;
  /** … or every account holding a role. Exactly one of the two. */
  audienceRole?: "admin" | "federation" | "referee";
  /** Narrow a role-wide notice to one country: only that country's federation seats (and admins) see it. */
  countryCode?: string;
  title: Bilingual;
  detail: Bilingual;
  tone: "pitch" | "amber" | "red" | "var";
  href?: string;
  /** Recurring jobs set this so the same alert is not raised twice. */
  dedupeKey?: string;
  /** Also queue it for e-mail / SMS / WhatsApp delivery. */
  channels?: Array<{ channel: "email" | "sms" | "whatsapp"; recipient: string }>;
}

/** Prepared statements (not yet run) for one notification, ready to join a batch. */
export function notifyStmts(db: D1Database, n: NotificationInput): D1PreparedStatement[] {
  const id = uuid();
  const stmts = [
    db
      .prepare(
        "INSERT OR IGNORE INTO notifications (id, user_id, audience_role, country_code, dedupe_key, title, detail, tone, href) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        n.userId ?? null,
        n.userId ? null : (n.audienceRole ?? "federation"),
        n.userId ? null : (n.countryCode ?? null),
        n.dedupeKey ?? null,
        JSON.stringify(n.title),
        JSON.stringify(n.detail),
        n.tone,
        n.href ?? "/",
      ),
  ];
  for (const ch of n.channels ?? []) {
    // Only queued when the notification row above was actually inserted (not a deduped repeat).
    stmts.push(
      db
        .prepare(
          "INSERT INTO notification_outbox (notification_id, channel, recipient) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM notifications WHERE id = ?)",
        )
        .bind(id, ch.channel, ch.recipient, id),
    );
  }
  return stmts;
}

/** Delivers queued messages to the configured webhook. Without one, they stay queued. */
export async function drainOutbox(env: Env, limit = 50) {
  if (!env.MAIL_WEBHOOK_URL) return { sent: 0, failed: 0, skipped: true };
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.channel, o.recipient, n.title, n.detail, n.href
       FROM notification_outbox o JOIN notifications n ON n.id = o.notification_id
      WHERE o.status = 'queued' AND o.attempts < 5 ORDER BY o.id LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: number; channel: string; recipient: string; title: string; detail: string; href: string }>();

  let sent = 0;
  let failed = 0;
  for (const row of results) {
    try {
      const res = await fetch(env.MAIL_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.MAIL_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.MAIL_WEBHOOK_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          channel: row.channel,
          to: row.recipient,
          title: JSON.parse(row.title),
          detail: JSON.parse(row.detail),
          href: row.href,
        }),
      });
      if (!res.ok) throw new Error(`webhook answered ${res.status}`);
      await env.DB.prepare("UPDATE notification_outbox SET status = 'sent', sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
      sent++;
    } catch (err) {
      await env.DB.prepare("UPDATE notification_outbox SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'queued' END WHERE id = ?")
        .bind(String(err).slice(0, 200), row.id)
        .run();
      failed++;
    }
  }
  return { sent, failed, skipped: false };
}

/**
 * Notify one official: an in-app notification on their account, plus e-mail
 * (and SMS / WhatsApp when a phone number is on file) in the delivery queue.
 * Officials without an account get nothing stored — there is nowhere to show it.
 */
export async function notifyOfficialStmts(
  db: D1Database,
  officialId: string,
  n: Omit<NotificationInput, "userId" | "audienceRole" | "channels">,
): Promise<D1PreparedStatement[]> {
  const account = await db
    .prepare(
      `SELECT u.id AS userId, COALESCE(o.email, u.email) AS email, o.phone AS phone
         FROM officials o LEFT JOIN users u ON u.official_id = o.id AND u.active = 1 WHERE o.id = ?`,
    )
    .bind(officialId)
    .first<{ userId: string | null; email: string | null; phone: string | null }>();
  if (!account?.userId) return [];
  const channels: NotificationInput["channels"] = [];
  if (account.email) channels.push({ channel: "email", recipient: account.email });
  if (account.phone) channels.push({ channel: "sms", recipient: account.phone });
  return notifyStmts(db, { ...n, userId: account.userId, channels });
}
