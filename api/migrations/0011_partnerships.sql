-- ARIS — the partnership pipeline: the national federations ARIS is talking to, before they become partners.
--
--   prospect → contacted → negotiating → agreement_signed → onboarded
--                    ↘ on_hold (and back) ↘ declined
--
-- "onboarded" is reached only through POST /partnerships/:id/onboard, which activates the country and creates the
-- federation and its first seat in the same batch, so an onboarded partnership always points at a real federation.
-- Admin-only: a prospect is not yet anybody's federation, so no federation seat can read this.

CREATE TABLE partnerships (
  id                   TEXT PRIMARY KEY,
  country              TEXT NOT NULL REFERENCES countries (code) ON DELETE RESTRICT,
  federation_name      TEXT NOT NULL,
  -- the code the federation will carry once onboarded ("FRMF"); it may still change until then
  federation_code      TEXT COLLATE NOCASE,
  stage                TEXT NOT NULL DEFAULT 'prospect'
                       CHECK (stage IN ('prospect', 'contacted', 'negotiating', 'on_hold', 'agreement_signed', 'onboarded', 'declined')),
  priority             TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  -- the person ARIS talks to at the federation
  contact_name         TEXT,
  contact_role         TEXT,
  contact_email        TEXT,
  contact_phone        TEXT,
  -- the ARIS administrator who owns the relationship
  owner_user_id        TEXT REFERENCES users (id) ON DELETE SET NULL,
  next_step            TEXT,
  next_step_due        TEXT CHECK (next_step_due IS NULL OR next_step_due GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  -- the officials the federation runs: the size of the deal
  officials_estimate   INTEGER CHECK (officials_estimate IS NULL OR officials_estimate >= 0),
  agreement_reference  TEXT,
  agreement_signed_on  TEXT CHECK (agreement_signed_on IS NULL OR agreement_signed_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  declined_reason      TEXT,
  federation_id        TEXT UNIQUE REFERENCES federations (id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- a signed agreement has a reference and a date; an onboarded one also has its federation; a refusal says why
  CHECK (stage NOT IN ('agreement_signed', 'onboarded') OR (agreement_reference IS NOT NULL AND agreement_signed_on IS NOT NULL)),
  CHECK (stage <> 'onboarded' OR federation_id IS NOT NULL),
  CHECK (stage <> 'declined' OR declined_reason IS NOT NULL)
);
-- one live relationship per country; a declined one can be followed by a fresh approach later
CREATE UNIQUE INDEX uq_partnerships_open_country ON partnerships (country) WHERE stage <> 'declined';
CREATE INDEX idx_partnerships_stage ON partnerships (stage, next_step_due);

-- The relationship's timeline: calls, e-mails, meetings, notes, and every stage change. Append-only, like the audit log.
CREATE TABLE partnership_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  partnership_id  TEXT NOT NULL REFERENCES partnerships (id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('note', 'call', 'email', 'meeting', 'stage')),
  body            TEXT,
  from_stage      TEXT,
  to_stage        TEXT,
  -- when it happened (a call logged afterwards keeps the day it took place)
  occurred_on     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  actor_user_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (kind <> 'stage' OR to_stage IS NOT NULL),
  CHECK (kind = 'stage' OR (body IS NOT NULL AND length(body) > 0))
);
CREATE INDEX idx_partnership_events ON partnership_events (partnership_id, id DESC);

CREATE TRIGGER partnership_events_no_update BEFORE UPDATE ON partnership_events
BEGIN SELECT RAISE(ABORT, 'partnership_events is append-only'); END;
