-- ARIS — observer evaluation: the weighted grid, reports on a match, and the dossiers generated from them.

-- Configurable grid. Weights are percentages and must total 100.
CREATE TABLE evaluation_criteria (
  key     TEXT PRIMARY KEY,
  label   TEXT NOT NULL,                          -- JSON, one entry per locale
  weight  INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 100),
  sort    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE assessments (
  id                TEXT PRIMARY KEY,
  match_id          TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  referee_id        TEXT NOT NULL REFERENCES officials (id),
  observer_id       TEXT NOT NULL REFERENCES officials (id),
  state             TEXT NOT NULL CHECK (state IN ('filed', 'draft', 'overdue')),
  filed_hours_after INTEGER,
  filed_at          TEXT,
  -- a filed report stays confidential until the federation releases it to the referee
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


-- Average ARPS per month, continental ('') or per country; written by the daily job so the trend is real history.
CREATE TABLE performance_history (
  month         TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  country_code  TEXT NOT NULL DEFAULT '',
  avg_arps      REAL NOT NULL,
  officials     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, country_code)
);
