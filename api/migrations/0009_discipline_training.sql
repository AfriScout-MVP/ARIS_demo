-- ARIS — incidents, discipline and training.


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
  name      TEXT NOT NULL,                        -- JSON, one entry per locale
  provider  TEXT NOT NULL,
  -- NULL = offered platform-wide; otherwise run by one federation for its own officials
  federation_id TEXT REFERENCES federations (id) ON DELETE CASCADE,
  hours     INTEGER NOT NULL,
  state     TEXT NOT NULL CHECK (state IN ('enrolled', 'completed', 'not-started'))
);

CREATE TABLE course_enrolments (
  course_id    TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  official_id  TEXT NOT NULL REFERENCES officials (id) ON DELETE CASCADE,
  completed_at TEXT,
  PRIMARY KEY (course_id, official_id)
);

