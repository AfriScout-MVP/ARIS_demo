-- ARIS — the referee register: one file per official (referee or assistant).
-- AfriScout equivalent: match_officials (+ official_unavailability → availability).

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
  photo_media_id TEXT REFERENCES media_assets (id) ON DELETE SET NULL,
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
  bio            TEXT NOT NULL DEFAULT '{}',      -- JSON, one entry per locale
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_officials_country ON officials (country_code);
CREATE INDEX idx_officials_kind_status ON officials (kind, status);

-- identity papers, medical certificates, attestations, photo — the files themselves are in R2
-- and indexed by media_assets; this row says what the file is for and whether it was verified.
CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  official_id   TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('licence', 'identity', 'medical', 'certificate', 'attestation', 'receipt', 'photo', 'other')),
  media_id      TEXT NOT NULL UNIQUE REFERENCES media_assets (id),
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
