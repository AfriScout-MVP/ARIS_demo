-- ARIS — core schema (Cloudflare D1 / SQLite).
--
-- Organised around the eight modules in the referee-management brief:
--   1 referee register      2 designations        3 availability
--   4 fees & payments       5 evaluation          6 reports / dashboards
--   7 personal space        8 incidents, discipline & training
--
-- Conventions
--   * ids are text slugs/UUIDs; dates are ISO-8601 text (YYYY-MM-DD, or a full
--     timestamp for *_at columns); booleans are 0/1 integers.
--   * bilingual copy is a JSON object {"en": "...", "fr": "..."}.
--   * money is an integer in whole currency units (XOF / FCFA has no minor unit).
--   * rules that must never be broken are enforced here as constraints and
--     triggers, not only in application code.

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'commission', 'observer', 'referee')),
  -- the official this account belongs to (referee / observer personal space)
  official_id    TEXT REFERENCES officials (id) ON DELETE SET NULL,
  -- what a commission account may designate: 'all', 'zone:UNAF' or 'country:EGY'
  scope          TEXT NOT NULL DEFAULT 'all',
  password_hash  TEXT NOT NULL,
  locale         TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en')),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  -- bumped on password change / deactivation; invalidates every issued token
  token_version  INTEGER NOT NULL DEFAULT 0,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE login_attempts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  email    TEXT NOT NULL COLLATE NOCASE,
  ip       TEXT,
  success  INTEGER NOT NULL CHECK (success IN (0, 1)),
  at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_login_attempts_email_at ON login_attempts (email, at);

/* ------------------------------------------------------------------ *
 * Geography & competitions
 * ------------------------------------------------------------------ */

CREATE TABLE countries (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  name_fr         TEXT NOT NULL,
  flag            TEXT NOT NULL,
  federation      TEXT NOT NULL,
  zone            TEXT NOT NULL CHECK (zone IN ('UNAF', 'UFOA-A', 'UFOA-B', 'UNIFFAC', 'CECAFA', 'COSAFA')),
  capital         TEXT NOT NULL,
  sync_source     TEXT NOT NULL CHECK (sync_source IN ('COMET', 'League feed', 'Manual entry')),
  sync_health     TEXT NOT NULL CHECK (sync_health IN ('healthy', 'stale', 'manual')),
  last_sync_hours INTEGER NOT NULL DEFAULT 0,
  clubs           TEXT NOT NULL DEFAULT '[]'   -- JSON array of club names
);

CREATE TABLE competitions (
  id               TEXT PRIMARY KEY,
  -- a country code, or 'CAF' for continental competitions (so no foreign key)
  country_code     TEXT NOT NULL,
  name             TEXT NOT NULL,
  tier             TEXT NOT NULL CHECK (tier IN ('d1', 'd2', 'cup', 'continental')),
  gender           TEXT NOT NULL CHECK (gender IN ('M', 'W')),
  matchdays        INTEGER NOT NULL,
  current_matchday INTEGER NOT NULL,
  var_enabled      INTEGER NOT NULL CHECK (var_enabled IN (0, 1)),
  weight           REAL NOT NULL
);

/* ------------------------------------------------------------------ *
 * 1. Referee register — one file per official
 * ------------------------------------------------------------------ */

CREATE TABLE officials (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('referee', 'assistant')),
  matricule      TEXT UNIQUE,                     -- unique registration number
  licence_no     TEXT UNIQUE,
  name           TEXT NOT NULL,
  initials       TEXT NOT NULL,
  country_code   TEXT NOT NULL REFERENCES countries (code),
  nationality    TEXT,
  birth_date     TEXT,
  city           TEXT,
  region         TEXT,
  league         TEXT,                            -- league / district / association
  intervention_zones TEXT NOT NULL DEFAULT '[]',  -- JSON array of zones / countries
  disciplines    TEXT NOT NULL DEFAULT '["football"]', -- football | futsal | football7
  email          TEXT,
  phone          TEXT,
  photo_key      TEXT,                            -- R2 object key
  level          TEXT NOT NULL CHECK (level IN ('CAF Elite', 'FIFA Listed', 'National D1', 'Regional')),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'suspended', 'training', 'elite-pool', 'unavailable', 'retired')),
  -- what to go back to when a suspension ends
  status_before_suspension TEXT,
  var_qualified  INTEGER NOT NULL DEFAULT 0 CHECK (var_qualified IN (0, 1)),
  years_active   INTEGER NOT NULL DEFAULT 0,
  -- performance, kept current from filed assessments (see routes/assessments)
  arps           REAL NOT NULL DEFAULT 0,
  rmcs_avg       REAL NOT NULL DEFAULT 0,         -- for assistants: their rating
  fitness        INTEGER NOT NULL DEFAULT 80,
  matches        INTEGER NOT NULL DEFAULT 0,
  yellow_cards   INTEGER NOT NULL DEFAULT 0,
  red_cards      INTEGER NOT NULL DEFAULT 0,
  var_accuracy   REAL NOT NULL DEFAULT 0,
  trend          REAL NOT NULL DEFAULT 0,
  bio_en         TEXT NOT NULL DEFAULT '',
  bio_fr         TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_officials_country ON officials (country_code);
CREATE INDEX idx_officials_kind_status ON officials (kind, status);

-- identity papers, medical certificates, attestations, photo (files live in R2)
CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  official_id   TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('licence', 'identity', 'medical', 'certificate', 'attestation', 'receipt', 'photo', 'other')),
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  expires_on    TEXT,
  payment_id    TEXT,                             -- receipt / justification for a payment
  uploaded_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_documents_official ON documents (official_id);

CREATE TABLE conflicts_of_interest (
  id           TEXT PRIMARY KEY,
  official_id  TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('club', 'team', 'country')),
  subject      TEXT NOT NULL,                     -- club / team name or country code
  note         TEXT,
  declared_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (official_id, kind, subject)
);

/* ------------------------------------------------------------------ *
 * 2. Designations
 * ------------------------------------------------------------------ */

CREATE TABLE fixtures (
  id                 TEXT PRIMARY KEY,
  country_code       TEXT NOT NULL,               -- 'CAF' for continental ties
  competition_id     TEXT NOT NULL REFERENCES competitions (id),
  matchday           INTEGER NOT NULL,
  date               TEXT NOT NULL,
  kickoff            TEXT NOT NULL,
  home               TEXT NOT NULL,
  away               TEXT NOT NULL,
  home_code          TEXT,                        -- nations on a continental tie
  away_code          TEXT,
  city               TEXT NOT NULL,
  venue              TEXT NOT NULL,
  importance         INTEGER NOT NULL,
  risk               TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  played             INTEGER NOT NULL DEFAULT 0 CHECK (played IN (0, 1)),
  -- brouillon → à confirmer → validée par la commission → publiée officiellement
  designation_status TEXT NOT NULL DEFAULT 'draft'
                     CHECK (designation_status IN ('draft', 'awaiting_confirmation', 'validated', 'published')),
  validated_by       TEXT REFERENCES users (id) ON DELETE SET NULL,
  validated_at       TEXT,
  published_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_fixtures_date ON fixtures (date);
CREATE INDEX idx_fixtures_country ON fixtures (country_code);

CREATE TABLE designations (
  fixture_id   TEXT NOT NULL REFERENCES fixtures (id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('R', 'AR1', 'AR2', 'FOURTH', 'VAR', 'AVAR', 'OBS')),
  -- officials retire, they are not deleted; a hard delete is refused while designated
  official_id  TEXT REFERENCES officials (id),
  state        TEXT NOT NULL DEFAULT 'empty' CHECK (state IN ('confirmed', 'pending', 'declined', 'empty')),
  version      INTEGER NOT NULL DEFAULT 1,        -- optimistic concurrency
  updated_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (fixture_id, role),
  CHECK ((official_id IS NULL) = (state = 'empty'))
);
-- nobody holds two roles on the same match
CREATE UNIQUE INDEX uq_designations_one_role ON designations (fixture_id, official_id) WHERE official_id IS NOT NULL;
CREATE INDEX idx_designations_official ON designations (official_id);

-- Every change, with author, date and reason. Append-only (see triggers below).
CREATE TABLE designation_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id       TEXT NOT NULL,
  role             TEXT NOT NULL,
  action           TEXT NOT NULL CHECK (action IN ('assign', 'clear', 'confirm', 'accept', 'decline', 'replace', 'autofill', 'validate', 'publish', 'revert')),
  from_official_id TEXT,
  to_official_id   TEXT,
  from_state       TEXT,
  to_state         TEXT,
  actor_user_id    TEXT,
  actor_kind       TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'engine', 'system')),
  reason           TEXT,                          -- the "motif"
  engine_reason    TEXT,                          -- JSON: rating / travel / rest / friction
  run_id           TEXT,                          -- groups one auto-fill so it can be undone as a unit
  at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_designation_history_fixture ON designation_history (fixture_id, id DESC);
CREATE INDEX idx_designation_history_run ON designation_history (run_id) WHERE run_id IS NOT NULL;

/* ------------------------------------------------------------------ *
 * 3. Availability
 * ------------------------------------------------------------------ */

-- A day an official is not simply "available". Absence of a row = available.
CREATE TABLE availability (
  official_id  TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('unavailable', 'travelling', 'resting')),
  reason       TEXT CHECK (reason IN ('leave', 'work', 'injury', 'other')),
  note         TEXT,
  declared_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  declared_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (official_id, date)
);

/* ------------------------------------------------------------------ *
 * 4. Fees & payments
 * ------------------------------------------------------------------ */

CREATE TABLE fee_scales (
  id              TEXT PRIMARY KEY,
  tier            TEXT NOT NULL CHECK (tier IN ('d1', 'd2', 'cup', 'continental')),
  -- a scale for one competition overrides the tier default
  competition_id  TEXT REFERENCES competitions (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('R', 'AR1', 'AR2', 'FOURTH', 'VAR', 'AVAR', 'OBS')),
  amount          INTEGER NOT NULL CHECK (amount >= 0),
  transport       INTEGER NOT NULL DEFAULT 0 CHECK (transport >= 0),
  lodging         INTEGER NOT NULL DEFAULT 0 CHECK (lodging >= 0),
  meals           INTEGER NOT NULL DEFAULT 0 CHECK (meals >= 0),
  currency        TEXT NOT NULL DEFAULT 'XOF',
  effective_from  TEXT NOT NULL DEFAULT '2026-07-01'
);
CREATE UNIQUE INDEX uq_fee_scales ON fee_scales (tier, role, IFNULL(competition_id, ''));

CREATE TABLE payments (
  id                  TEXT PRIMARY KEY,
  fixture_id          TEXT NOT NULL REFERENCES fixtures (id),
  role                TEXT NOT NULL,
  official_id         TEXT NOT NULL REFERENCES officials (id),
  base                INTEGER NOT NULL CHECK (base >= 0),
  transport           INTEGER NOT NULL DEFAULT 0 CHECK (transport >= 0),
  lodging             INTEGER NOT NULL DEFAULT 0 CHECK (lodging >= 0),
  meals               INTEGER NOT NULL DEFAULT 0 CHECK (meals >= 0),
  bonus               INTEGER NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  deduction           INTEGER NOT NULL DEFAULT 0 CHECK (deduction >= 0),
  total               INTEGER GENERATED ALWAYS AS (base + transport + lodging + meals + bonus - deduction) VIRTUAL,
  currency            TEXT NOT NULL DEFAULT 'XOF',
  status              TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'validated', 'paid', 'contested', 'cancelled')),
  -- A designation alone never makes a payment final: the referee must have
  -- actually worked the match, the match must be validated, and the expenses
  -- checked. The database refuses a "paid" row without all three.
  presence_confirmed  INTEGER NOT NULL DEFAULT 0 CHECK (presence_confirmed IN (0, 1)),
  match_validated     INTEGER NOT NULL DEFAULT 0 CHECK (match_validated IN (0, 1)),
  expenses_verified   INTEGER NOT NULL DEFAULT 0 CHECK (expenses_verified IN (0, 1)),
  validated_by        TEXT REFERENCES users (id) ON DELETE SET NULL,
  validated_at        TEXT,
  paid_at             TEXT,
  payment_ref         TEXT,
  contest_note        TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (fixture_id, role),
  CHECK (status <> 'paid' OR (presence_confirmed = 1 AND match_validated = 1 AND expenses_verified = 1 AND paid_at IS NOT NULL))
);
CREATE INDEX idx_payments_official ON payments (official_id, status);

CREATE TABLE advances (
  id             TEXT PRIMARY KEY,
  official_id    TEXT NOT NULL REFERENCES officials (id),
  fixture_id     TEXT REFERENCES fixtures (id),
  amount         INTEGER NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL DEFAULT 'XOF',
  justification  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'paid', 'settled', 'rejected')),
  decided_by     TEXT REFERENCES users (id) ON DELETE SET NULL,
  requested_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at     TEXT
);

/* ------------------------------------------------------------------ *
 * 5. Evaluation
 * ------------------------------------------------------------------ */

-- Configurable grid. Weights are percentages and must total 100.
CREATE TABLE evaluation_criteria (
  key     TEXT PRIMARY KEY,
  label   TEXT NOT NULL,                          -- JSON {en, fr}
  weight  INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 100),
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE matches (
  id               TEXT PRIMARY KEY,
  fixture_id       TEXT REFERENCES fixtures (id) ON DELETE SET NULL,
  home             TEXT NOT NULL,
  away             TEXT NOT NULL,
  competition_id   TEXT NOT NULL REFERENCES competitions (id),
  country_code     TEXT NOT NULL,
  date             TEXT NOT NULL,
  score            TEXT NOT NULL,
  referee_id       TEXT NOT NULL REFERENCES officials (id),
  arps_for_match   REAL NOT NULL,
  rmcs             REAL NOT NULL,
  pressure_avg     REAL NOT NULL,
  physical         TEXT NOT NULL,                 -- JSON
  pressure_timeline TEXT NOT NULL                 -- JSON
);
CREATE INDEX idx_matches_referee ON matches (referee_id, date);

-- The video / decision log: match minute, type of action, decision, outcome.
CREATE TABLE match_decisions (
  id              TEXT PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  minute          INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('Penalty', 'Red Card', 'Yellow Card', 'Offside', 'Handball', 'Foul')),
  description     TEXT NOT NULL,                  -- JSON {en, fr}
  initial_call    TEXT NOT NULL CHECK (initial_call IN ('given', 'not-given')),
  var_review      INTEGER NOT NULL CHECK (var_review IN (0, 1)),
  final_call      TEXT NOT NULL CHECK (final_call IN ('confirmed', 'overturned')),
  confidence      REAL NOT NULL,
  pressure_index  REAL NOT NULL,
  distance        REAL NOT NULL,
  players         TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE assessments (
  id                TEXT PRIMARY KEY,
  match_id          TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  referee_id        TEXT NOT NULL REFERENCES officials (id),
  observer_id       TEXT NOT NULL REFERENCES officials (id),
  state             TEXT NOT NULL CHECK (state IN ('filed', 'draft', 'overdue')),
  filed_hours_after INTEGER,
  filed_at          TEXT,
  -- a filed report stays confidential until the commission releases it to the referee
  published         INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  overall           REAL NOT NULL,
  marks             TEXT NOT NULL,                -- JSON {criterion key: 0–10}
  notes             TEXT NOT NULL,                -- JSON {en, fr}
  clips             TEXT NOT NULL DEFAULT '[]',   -- JSON [{minute, label}]
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (match_id, observer_id)
);
CREATE INDEX idx_assessments_referee ON assessments (referee_id);

/* ------------------------------------------------------------------ *
 * 6. Reports
 * ------------------------------------------------------------------ */

CREATE TABLE dossiers (
  id            TEXT PRIMARY KEY,
  match_id      TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  generated     TEXT NOT NULL,
  pages         INTEGER NOT NULL,
  recipients    TEXT NOT NULL DEFAULT '[]',
  generated_by  TEXT REFERENCES users (id) ON DELETE SET NULL
);

/* ------------------------------------------------------------------ *
 * 7. Notifications
 * ------------------------------------------------------------------ */

CREATE TABLE notifications (
  id               TEXT PRIMARY KEY,
  -- one recipient (an account) or a whole role (every commission member)…
  user_id          TEXT REFERENCES users (id) ON DELETE CASCADE,
  audience_role    TEXT CHECK (audience_role IN ('admin', 'commission', 'observer', 'referee')),
  -- …and a stable key so recurring jobs do not repeat themselves
  dedupe_key       TEXT UNIQUE,
  title            TEXT NOT NULL,                 -- JSON {en, fr}
  detail           TEXT NOT NULL,                 -- JSON {en, fr}
  tone             TEXT NOT NULL CHECK (tone IN ('pitch', 'amber', 'red', 'var')),
  href             TEXT NOT NULL DEFAULT '/',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((user_id IS NULL) <> (audience_role IS NULL))
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);

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

/* ------------------------------------------------------------------ *
 * 8. Incidents, discipline, training
 * ------------------------------------------------------------------ */

CREATE TABLE incidents (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('absence', 'lateness', 'refusal', 'incident')),
  official_id  TEXT NOT NULL REFERENCES officials (id),
  fixture_id   TEXT REFERENCES fixtures (id) ON DELETE SET NULL,
  severity     TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'critical')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'closed')),
  description  TEXT NOT NULL,
  justified    INTEGER CHECK (justified IN (0, 1)),   -- absence: justified or not
  reported_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  reported_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at    TEXT
);
CREATE INDEX idx_incidents_official ON incidents (official_id);

-- A suspension only follows an official decision: the case must be 'decided'
-- and carry the reference of the deciding body. A report alone never suspends.
CREATE TABLE disciplinary_cases (
  id               TEXT PRIMARY KEY,
  official_id      TEXT NOT NULL REFERENCES officials (id),
  incident_id      TEXT REFERENCES incidents (id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'opened'
                   CHECK (status IN ('opened', 'hearing_scheduled', 'decided', 'appealed', 'closed')),
  summary          TEXT NOT NULL,
  hearing_at       TEXT,
  decision         TEXT,
  decision_ref     TEXT,
  sanction         TEXT CHECK (sanction IN ('warning', 'suspension', 'removal', 'none')),
  suspension_from  TEXT,
  suspension_to    TEXT,
  appeal_note      TEXT,
  opened_by        TEXT REFERENCES users (id) ON DELETE SET NULL,
  decided_by       TEXT REFERENCES users (id) ON DELETE SET NULL,
  opened_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at       TEXT,
  CHECK (sanction IS NOT 'suspension' OR (status IN ('decided', 'appealed', 'closed') AND decision_ref IS NOT NULL AND suspension_from IS NOT NULL AND suspension_to IS NOT NULL AND suspension_to >= suspension_from))
);
CREATE INDEX idx_cases_official ON disciplinary_cases (official_id);

CREATE TABLE licences (
  id           TEXT PRIMARY KEY,
  official_id  TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('FIFA Badge', 'CAF Elite Panel', 'National D1', 'VAR Certification', 'Fitness Clearance')),
  issued       TEXT NOT NULL,
  expires      TEXT NOT NULL,
  CHECK (expires >= issued)
);
CREATE INDEX idx_licences_expires ON licences (expires);

CREATE TABLE fitness_tests (
  official_id   TEXT PRIMARY KEY REFERENCES officials (id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  test1_result  TEXT NOT NULL CHECK (test1_result IN ('passed', 'failed')),
  best_sprint   REAL NOT NULL,
  test2_result  TEXT NOT NULL CHECK (test2_result IN ('passed', 'failed')),
  laps          INTEGER NOT NULL,
  retest_date   TEXT
);

CREATE TABLE courses (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL DEFAULT 'course' CHECK (kind IN ('course', 'exam', 'camp')),
  name      TEXT NOT NULL,                        -- JSON {en, fr}
  provider  TEXT NOT NULL,
  hours     INTEGER NOT NULL,
  state     TEXT NOT NULL CHECK (state IN ('enrolled', 'completed', 'not-started'))
);

CREATE TABLE course_enrolments (
  course_id    TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  official_id  TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  completed_at TEXT,
  PRIMARY KEY (course_id, official_id)
);

/* ------------------------------------------------------------------ *
 * Audit — who did what, when, and why
 * ------------------------------------------------------------------ */

CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_user_id TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT,
  before        TEXT,
  after         TEXT,
  reason        TEXT,
  ip            TEXT
);
CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id, id DESC);

-- History is evidence. Neither table can be edited or pruned from SQL.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER designation_history_no_update BEFORE UPDATE ON designation_history
BEGIN SELECT RAISE(ABORT, 'designation_history is append-only'); END;
CREATE TRIGGER designation_history_no_delete BEFORE DELETE ON designation_history
BEGIN SELECT RAISE(ABORT, 'designation_history is append-only'); END;
