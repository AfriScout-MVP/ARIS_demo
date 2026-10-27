-- ARIS — the tagger role and the event → sub-event → outcome tagging model.
--
-- A tagger is country-scoped like a federation seat (it reuses federation_id for that), but its reach stops
-- at logging match decisions: it is not a federation seat and does not get a federation seat's other powers
-- (see api/src/lib/access.ts — isStaff, inCountry and countryFilter are deliberately left untouched for a
-- tagger; new, narrower helpers are added instead, used only by the tagging routes).
--
-- `users` is rebuilt because SQLite cannot widen a CHECK in place (precedent: 0013_auth_recovery.sql).

CREATE TABLE users_v2 (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'federation', 'referee', 'tagger')),
  official_id    TEXT REFERENCES officials (id) ON DELETE RESTRICT,
  federation_id  TEXT REFERENCES federations (id) ON DELETE RESTRICT,
  password_hash  TEXT NOT NULL,
  locale         TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en', 'es', 'de')),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  token_version  INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((role = 'referee') = (official_id IS NOT NULL)),
  -- a tagger is attached to a federation (for its country) exactly like a federation seat is
  CHECK ((role IN ('federation', 'tagger')) = (federation_id IS NOT NULL))
);
INSERT INTO users_v2 SELECT id, email, name, role, official_id, federation_id, password_hash, locale, active,
       token_version, must_change_password, last_login_at, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;
CREATE INDEX idx_users_federation ON users (federation_id) WHERE federation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_users_official ON users (official_id) WHERE official_id IS NOT NULL;

-- `match_decisions`: the flat 6-value `type` becomes the top-level `event_type`; `sub_event` and `outcome` are
-- new and nullable (a decision logged before this migration has neither). Only `event_type` is DB-checked —
-- `sub_event`/`outcome` are validated against api/src/domain/eventTaxonomy.ts at write time, not by SQLite,
-- so the taxonomy can grow leaf values without a further migration. `initial_call` / `var_review` / `final_call`
-- are untouched: they are specifically about a VAR look, which doesn't apply to every event type, and changing
-- them would touch every existing row and every reader for no present benefit.
CREATE TABLE match_decisions_v2 (
  id              TEXT PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  minute          INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'penalty_decision', 'card', 'offside_call', 'foul_advantage',
                    'var_review', 'misconduct_dissent', 'goal_validation'
                  )),
  sub_event       TEXT,
  outcome         TEXT,
  description     TEXT NOT NULL,                  -- JSON {en, fr}
  initial_call    TEXT NOT NULL CHECK (initial_call IN ('given', 'not-given')),
  var_review      INTEGER NOT NULL CHECK (var_review IN (0, 1)),
  final_call      TEXT NOT NULL CHECK (final_call IN ('confirmed', 'overturned')),
  confidence      REAL NOT NULL,
  pressure_index  REAL NOT NULL,
  distance        REAL NOT NULL,
  players         TEXT NOT NULL DEFAULT '[]',
  -- who tagged it: the audit log already has this, but keeping it on the row too lets a tagger's own
  -- entries be singled out later without replaying the audit log
  tagged_by       TEXT REFERENCES users (id) ON DELETE SET NULL
);
-- the six old enum values map 1:1 onto a new event_type; sub_event/outcome stay NULL for anything pre-existing
INSERT INTO match_decisions_v2 (id, match_id, minute, type, sub_event, outcome, description, initial_call, var_review, final_call, confidence, pressure_index, distance, players, tagged_by)
  SELECT id, match_id, minute,
         CASE type
           WHEN 'Penalty' THEN 'penalty_decision'
           WHEN 'Red Card' THEN 'card'
           WHEN 'Yellow Card' THEN 'card'
           WHEN 'Offside' THEN 'offside_call'
           WHEN 'Handball' THEN 'penalty_decision'
           WHEN 'Foul' THEN 'foul_advantage'
         END,
         CASE type WHEN 'Red Card' THEN 'red' WHEN 'Yellow Card' THEN 'yellow' WHEN 'Handball' THEN 'handball' ELSE NULL END,
         NULL, description, initial_call, var_review, final_call, confidence, pressure_index, distance, players, NULL
    FROM match_decisions;
DROP TABLE match_decisions;
ALTER TABLE match_decisions_v2 RENAME TO match_decisions;
CREATE INDEX idx_match_decisions_match ON match_decisions (match_id, minute);
