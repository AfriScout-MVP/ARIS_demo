-- ARIS — identity (Cloudflare D1 / SQLite).
--
-- Three roles, no more:
--   admin       the platform super-administrator — every country, every account
--   federation  one national federation's seat — confined to that federation's country
--   referee     an official's own space (a referee or an assistant)
--
-- Conventions (shared with every migration)
--   * ids are text slugs/UUIDs; ISO dates are YYYY-MM-DD, instants are ISO-8601 UTC
--     (YYYY-MM-DDTHH:MM:SS.sssZ); booleans are 0/1 integers.
--   * country codes are ISO 3166-1 alpha-3 — the same canonical form AfriScout stores.
--   * user-facing copy kept in the database is a JSON object keyed by locale
--     {"fr": "...", "en": "...", "es": "...", "de": "..."}; fr and en are always present.
--   * money is an integer in whole currency units.
--   * rules that must never be broken are constraints and triggers here, not only code.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'federation', 'referee')),
  -- the official this account belongs to: required for a referee, forbidden otherwise
  official_id    TEXT REFERENCES officials (id) ON DELETE RESTRICT,
  -- the federation this seat belongs to: required for a federation seat, forbidden otherwise
  federation_id  TEXT REFERENCES federations (id) ON DELETE RESTRICT,
  password_hash  TEXT NOT NULL,
  locale         TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en', 'es', 'de')),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  -- bumped on password change / role change / deactivation; invalidates every issued token
  token_version  INTEGER NOT NULL DEFAULT 0,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((role = 'referee') = (official_id IS NOT NULL)),
  CHECK ((role = 'federation') = (federation_id IS NOT NULL))
);
CREATE INDEX idx_users_federation ON users (federation_id) WHERE federation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_users_official ON users (official_id) WHERE official_id IS NOT NULL;

CREATE TABLE login_attempts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  email    TEXT NOT NULL COLLATE NOCASE,
  ip       TEXT,
  success  INTEGER NOT NULL CHECK (success IN (0, 1)),
  at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_login_attempts_email_at ON login_attempts (email, at);

-- A national federation. Exactly one per supported country (AfriScout: `federations`);
-- a federation seat is a user whose federation_id points here.
CREATE TABLE federations (
  id                   TEXT PRIMARY KEY,
  code                 TEXT NOT NULL UNIQUE COLLATE NOCASE,         -- "FRMF", "FIF"
  name                 TEXT NOT NULL,
  country              TEXT NOT NULL UNIQUE REFERENCES countries (code) ON DELETE RESTRICT,
  -- suspending a federation refuses every one of its seats at once
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  logo_media_id        TEXT REFERENCES media_assets (id) ON DELETE SET NULL,
  agreement_reference  TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (length(country) = 3)
);
