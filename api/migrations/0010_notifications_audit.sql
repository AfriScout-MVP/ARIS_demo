-- ARIS — notifications and the audit trail.

CREATE TABLE notifications (
  id               TEXT PRIMARY KEY,
  -- one recipient (an account) or a whole role (every seat of a federation)…
  user_id          TEXT REFERENCES users (id) ON DELETE CASCADE,
  audience_role    TEXT CHECK (audience_role IN ('admin', 'federation', 'referee')),
  -- …optionally narrowed to one country: a federation seat only sees its own country's alerts
  country_code     TEXT REFERENCES countries (code) ON DELETE CASCADE,
  -- …and a stable key so recurring jobs do not repeat themselves
  dedupe_key       TEXT UNIQUE,
  title            TEXT NOT NULL,                 -- JSON, one entry per locale
  detail           TEXT NOT NULL,                 -- JSON, one entry per locale
  tone             TEXT NOT NULL CHECK (tone IN ('pitch', 'amber', 'red', 'var')),
  href             TEXT NOT NULL DEFAULT '/',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((user_id IS NULL) <> (audience_role IS NULL))
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_audience ON notifications (audience_role, country_code, created_at DESC);

CREATE TABLE notification_reads (
  notification_id  TEXT NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (notification_id, user_id)
);

-- E-mail / SMS / WhatsApp delivery queue, drained by the cron trigger.
CREATE TABLE notification_outbox (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id  TEXT NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at          TEXT
);
CREATE INDEX idx_outbox_status ON notification_outbox (status, id);

-- Who did what, when, and why. `country_code` lets a federation read the trail of its own country only.
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_user_id TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT,
  country_code  TEXT,
  before        TEXT,
  after         TEXT,
  reason        TEXT,
  ip            TEXT
);
CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id, id DESC);
CREATE INDEX idx_audit_country ON audit_log (country_code, id DESC);

-- History is evidence. It cannot be edited or pruned from SQL.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
