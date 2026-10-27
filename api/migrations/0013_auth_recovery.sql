-- ARIS — account recovery, forced password changes, dismissable notifications and a retrying delivery queue.

-- An account an administrator (or a federation) created or reset carries a password someone else chose: its holder
-- must replace it before doing anything else. Every route but /auth/* refuses the account while this is set.
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));

-- "Forgot password": one row per link e-mailed. Only the SHA-256 of the token is kept — the token itself exists
-- only in the e-mail. A link works once, for 60 minutes, and only while the account's token_version is the one it was
-- issued under: any later reset, password change, deactivation or sign-out-everywhere bumps it and kills the link.
CREATE TABLE password_resets (
  token_hash     TEXT PRIMARY KEY,                -- hex SHA-256 of the 32-byte random token
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_version  INTEGER NOT NULL,
  expires_at     TEXT NOT NULL,
  used_at        TEXT,
  ip             TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_password_resets_user ON password_resets (user_id);

-- Throttle for the signed-out recovery routes. Kept apart from login_attempts on purpose: asking for a link many
-- times must not lock the account's sign-in. Every request is logged, whether or not the e-mail has an account.
CREATE TABLE auth_throttle (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  kind   TEXT NOT NULL CHECK (kind IN ('forgot', 'reset')),
  email  TEXT COLLATE NOCASE,
  ip     TEXT,
  at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_auth_throttle_email ON auth_throttle (kind, email, at);
CREATE INDEX idx_auth_throttle_ip ON auth_throttle (kind, ip, at);

-- A person removes a notification from their own list. A role-wide notice is shared by many accounts, so it is hidden
-- for that person only (the row stays for the others).
ALTER TABLE notification_reads ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1));

-- The delivery queue, rebuilt (SQLite cannot widen a CHECK in place):
--   * `dead` — given up after the retry cap; never retried by the cron, an administrator may requeue it
--   * `next_attempt_at` — a failed message waits (exponential backoff) before the cron tries again
--   * `user_id` — the account it is for: its language, and the country a federation may read it under
--   * `subject` / `body` / `expires_at` — a direct message with no in-app notification (a password-reset link).
--     Its body is cleared once it is sent or dead, and it is never delivered after `expires_at`.
CREATE TABLE notification_outbox_v2 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id  TEXT REFERENCES notifications (id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users (id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient        TEXT NOT NULL,
  subject          TEXT,
  body             TEXT,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'dead')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  next_attempt_at  TEXT,
  expires_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at          TEXT,
  -- something to deliver: a notification, or a direct message whose body is still there (or already delivered)
  CHECK (notification_id IS NOT NULL OR subject IS NOT NULL)
);
INSERT INTO notification_outbox_v2 (id, notification_id, user_id, channel, recipient, status, attempts, last_error, created_at, sent_at)
  SELECT o.id, o.notification_id, n.user_id, o.channel, o.recipient,
         -- the old queue stopped at 5 attempts and called that `failed`: under the new rules that is `dead`
         CASE WHEN o.status = 'failed' THEN 'dead' ELSE o.status END,
         o.attempts, o.last_error, o.created_at, o.sent_at
    FROM notification_outbox o LEFT JOIN notifications n ON n.id = o.notification_id;
DROP TABLE notification_outbox;
ALTER TABLE notification_outbox_v2 RENAME TO notification_outbox;
CREATE INDEX idx_outbox_status ON notification_outbox (status, next_attempt_at, id);
CREATE INDEX idx_outbox_user ON notification_outbox (user_id);
