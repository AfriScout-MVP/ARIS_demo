-- ARIS — fixtures and designations.
-- AfriScout equivalents: federation_fixtures and fixture_assignments.
--
-- A fixture is stored the way AfriScout stores one: two team ids, a stadium id, one
-- kickoff instant in UTC (`kickoff_at`). `date` is derived from it, never written.

CREATE TABLE fixtures (
  id                 TEXT PRIMARY KEY,
  country_code       TEXT NOT NULL,               -- the federation that runs it; 'CAF' for continental ties
  competition_id     TEXT NOT NULL REFERENCES competitions (id),
  round_no           INTEGER NOT NULL CHECK (round_no >= 1),
  round_label        TEXT,
  home_team_id       TEXT NOT NULL REFERENCES teams (id),
  away_team_id       TEXT NOT NULL REFERENCES teams (id),
  stadium_id         TEXT REFERENCES stadiums (id) ON DELETE SET NULL,
  kickoff_at         TEXT NOT NULL CHECK (kickoff_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z' AND length(kickoff_at) >= 20),
  date               TEXT GENERATED ALWAYS AS (substr(kickoff_at, 1, 10)) VIRTUAL,
  importance         INTEGER NOT NULL CHECK (importance BETWEEN 0 AND 100),
  risk               TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'played', 'postponed', 'cancelled')),
  -- brouillon → à confirmer → validée par la fédération → publiée officiellement
  designation_status TEXT NOT NULL DEFAULT 'draft'
                     CHECK (designation_status IN ('draft', 'awaiting_confirmation', 'validated', 'published')),
  validated_by       TEXT REFERENCES users (id) ON DELETE SET NULL,
  validated_at       TEXT,
  published_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (home_team_id <> away_team_id)
);
CREATE INDEX idx_fixtures_date ON fixtures (date);
CREATE INDEX idx_fixtures_country ON fixtures (country_code, kickoff_at);
CREATE INDEX idx_fixtures_competition ON fixtures (competition_id, round_no);
CREATE UNIQUE INDEX uq_fixtures_pairing ON fixtures (competition_id, round_no, home_team_id, away_team_id);

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

-- History is evidence. It cannot be edited or pruned from SQL.
CREATE TRIGGER designation_history_no_update BEFORE UPDATE ON designation_history
BEGIN SELECT RAISE(ABORT, 'designation_history is append-only'); END;
CREATE TRIGGER designation_history_no_delete BEFORE DELETE ON designation_history
BEGIN SELECT RAISE(ABORT, 'designation_history is append-only'); END;
