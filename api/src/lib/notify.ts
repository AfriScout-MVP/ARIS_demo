import type { Env, Locale } from "../env";
import { uuid } from "./http";
import { pick, type Localized } from "./localized";

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
  /** Also queue it for e-mail / SMS / WhatsApp delivery to exactly these recipients. */
  channels?: Array<{ channel: "email" | "sms" | "whatsapp"; recipient: string }>;
  /**
   * Without `channels`, a notice for staff (an admin or federation account, or the admin / federation role) is also
   * e-mailed to every active account it reaches. `false` keeps it in-app only. Referee-wide notices are never mass-mailed.
   */
  email?: boolean;
}

/**
 * E-mail copies of a staff notice: one queued message per active, usable admin / federation account the notice reaches —
 * the addressed account, or every seat of the role (narrowed to `country` for federations). Inserted only when the
 * notification row itself was (a deduped repeat queues nothing).
 */
const STAFF_EMAIL_SQL = `INSERT INTO notification_outbox (notification_id, user_id, channel, recipient)
  SELECT ?1, u.id, 'email', u.email FROM users u
    LEFT JOIN federations f ON f.id = u.federation_id LEFT JOIN countries c ON c.code = f.country
   WHERE EXISTS (SELECT 1 FROM notifications WHERE id = ?1)
     AND u.active = 1 AND u.role IN ('admin', 'federation')
     AND (u.role <> 'federation' OR (f.status = 'active' AND c.active = 1))
     AND CASE WHEN ?2 IS NOT NULL THEN u.id = ?2
              ELSE u.role = ?3 AND (?4 IS NULL OR u.role <> 'federation' OR f.country = ?4) END`;

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
          "INSERT INTO notification_outbox (notification_id, user_id, channel, recipient) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM notifications WHERE id = ?)",
        )
        .bind(id, n.userId ?? null, ch.channel, ch.recipient, id),
    );
  }
  const audience = n.userId ? null : (n.audienceRole ?? "federation");
  if (!n.channels && n.email !== false && audience !== "referee") {
    stmts.push(db.prepare(STAFF_EMAIL_SQL).bind(id, n.userId ?? null, audience, n.countryCode ?? null));
  }
  return stmts;
}

/**
 * A direct e-mail with no in-app notification behind it (a password-reset link): it goes through the same queue,
 * with the same retries. Its body is cleared once sent or given up, and it is never delivered after `expiresAt`.
 */
export function directMailStmt(db: D1Database, m: { userId: string; to: string; subject: string; body: string; expiresAt?: string }) {
  return db
    .prepare("INSERT INTO notification_outbox (user_id, channel, recipient, subject, body, expires_at) VALUES (?, 'email', ?, ?, ?, ?) RETURNING id")
    .bind(m.userId, m.to, m.subject, m.body, m.expiresAt ?? null);
}

/** Attempts per message before it is marked `dead`. */
export const MAX_ATTEMPTS = 6;
/** Wait before retry n (n = attempts so far): 5, 10, 20, 40, 80 minutes … capped at six hours. */
export const backoffMinutes = (attempts: number) => Math.min(5 * 2 ** Math.max(0, attempts - 1), 360);

export const RESEND_URL = "https://api.resend.com/emails";
/** Resend's shared sender, usable before a domain of one's own is verified. Set MAIL_FROM in production. */
const DEFAULT_FROM = "ARIS <onboarding@resend.dev>";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

interface OutboxRow {
  id: number;
  channel: "email" | "sms" | "whatsapp";
  recipient: string;
  attempts: number;
  subject: string | null;
  body: string | null;
  title: string | null;
  detail: string | null;
  href: string | null;
  locale: Locale | null;
}

/** What a message says, in its recipient's language: the subject line, the text and (for a notification) its link. */
export function composeMessage(row: Pick<OutboxRow, "subject" | "body" | "title" | "detail" | "href" | "locale">, origin?: string) {
  if (row.subject !== null) return { subject: row.subject, text: row.body ?? "" };
  const locale = row.locale ?? "fr";
  const title = safeJson(row.title);
  const detail = safeJson(row.detail);
  let link: string | null = null;
  if (origin && row.href) {
    try {
      link = new URL(row.href, origin).toString();
    } catch {
      link = null;
    }
  }
  return { subject: pick(title, locale), text: [pick(detail, locale), link].filter(Boolean).join("\n\n"), title, detail, href: row.href };
}

function safeJson(text: string | null): Partial<Localized> {
  try {
    return text ? (JSON.parse(text) as Partial<Localized>) : {};
  } catch {
    return {};
  }
}

async function deliver(env: Env, row: OutboxRow) {
  const msg = composeMessage(row, env.PUBLIC_ORIGIN);
  if (row.channel === "email" && env.RESEND_API_KEY) {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || DEFAULT_FROM, to: [row.recipient], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`resend answered ${res.status}`);
    return;
  }
  const res = await fetch(env.MAIL_WEBHOOK_URL!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.MAIL_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.MAIL_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify({ channel: row.channel, to: row.recipient, ...msg }),
  });
  if (!res.ok) throw new Error(`webhook answered ${res.status}`);
}

/**
 * Delivers what is due: queued messages, and failed ones whose backoff has run out. E-mail goes through Resend when
 * RESEND_API_KEY is set, everything else (and e-mail without Resend) to MAIL_WEBHOOK_URL; with neither, messages stay
 * queued. A failure waits `backoffMinutes` before the next try; after MAX_ATTEMPTS the message is `dead`. Sent and
 * dead messages are never picked up again (an administrator may requeue a dead one).
 * `ids` restricts the run to those rows (a reset link is sent at once, not at the next cron tick).
 */
export async function drainOutbox(env: Env, opts: { limit?: number; ids?: number[] } = {}) {
  const db = env.DB;
  // links that expired before they could be sent are dropped, and their text with them
  await db
    .prepare(`UPDATE notification_outbox SET status = 'dead', body = NULL, last_error = 'expired' WHERE status IN ('queued','failed') AND expires_at IS NOT NULL AND expires_at <= ${NOW}`)
    .run();
  const viaResend = !!env.RESEND_API_KEY;
  const viaWebhook = !!env.MAIL_WEBHOOK_URL;
  if (!viaResend && !viaWebhook) return { sent: 0, failed: 0, dead: 0, skipped: true };

  const ids = opts.ids?.slice(0, 90) ?? [];
  const { results } = await db
    .prepare(
      `SELECT o.id, o.channel, o.recipient, o.attempts, o.subject, o.body, n.title, n.detail, n.href, u.locale
         FROM notification_outbox o
         LEFT JOIN notifications n ON n.id = o.notification_id
         LEFT JOIN users u ON u.id = COALESCE(o.user_id, n.user_id)
        WHERE (o.status = 'queued' OR (o.status = 'failed' AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ${NOW})))
          ${viaWebhook ? "" : "AND o.channel = 'email'"}
          ${ids.length ? `AND o.id IN (${ids.map(() => "?").join(", ")})` : ""}
        ORDER BY o.id LIMIT ?`,
    )
    .bind(...ids, opts.limit ?? 50)
    .all<OutboxRow>();

  let sent = 0;
  let failed = 0;
  let dead = 0;
  for (const row of results) {
    try {
      await deliver(env, row);
      await db
        .prepare(`UPDATE notification_outbox SET status = 'sent', sent_at = ${NOW}, attempts = attempts + 1, last_error = NULL, next_attempt_at = NULL, body = NULL WHERE id = ?`)
        .bind(row.id)
        .run();
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await db
        .prepare(
          `UPDATE notification_outbox SET attempts = ?, last_error = ?, status = ?, body = CASE WHEN ? THEN NULL ELSE body END,
                  next_attempt_at = CASE WHEN ? THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now', ?) END WHERE id = ?`,
        )
        .bind(attempts, String(err).slice(0, 200), giveUp ? "dead" : "failed", giveUp ? 1 : 0, giveUp ? 1 : 0, `+${backoffMinutes(attempts)} minutes`, row.id)
        .run();
      if (giveUp) dead++;
      else failed++;
    }
  }
  return { sent, failed, dead, skipped: false };
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
