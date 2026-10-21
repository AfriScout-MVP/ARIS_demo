-- ARIS — played matches.
--
-- `matches` has the same columns, names and constraints as AfriScout's `matches` table
-- (league_id, season, matchday, home_team_id, away_team_id, match_date, venue, referee,
-- home_score, away_score, score_source, status, attendance, weather_conditions, extra_data),
-- so a row can be exchanged between the two systems unchanged. What ARIS adds is kept
-- beside it: `referee_id` / `fixture_id` here, and the refereeing analytics in
-- `match_officiating` and `match_decisions`.

CREATE TABLE matches (
  id                 TEXT PRIMARY KEY,
  league_id          TEXT REFERENCES competitions (id),           -- ARIS: the competition
  season             TEXT CHECK (season IS NULL OR season GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  matchday           TEXT,                                        -- numeric or text ("Quarter-final")
  home_team_id       TEXT NOT NULL REFERENCES teams (id),
  away_team_id       TEXT NOT NULL REFERENCES teams (id),
  match_date         TEXT NOT NULL,                               -- ISO-8601 UTC
  venue              TEXT,
  referee            TEXT,                                        -- the referee's name as printed on the report
  home_score         INTEGER CHECK (home_score IS NULL OR home_score >= 0),
  away_score         INTEGER CHECK (away_score IS NULL OR away_score >= 0),
  score_source       TEXT CHECK (score_source IS NULL OR score_source IN ('official', 'tagged')),
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  attendance         INTEGER CHECK (attendance IS NULL OR attendance >= 0),
  weather_conditions TEXT,                                        -- JSON
  extra_data         TEXT NOT NULL DEFAULT '{}',                  -- JSON
  -- ARIS-only links
  fixture_id         TEXT UNIQUE REFERENCES fixtures (id) ON DELETE SET NULL,
  referee_id         TEXT REFERENCES officials (id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (home_team_id <> away_team_id)
);
-- AfriScout: one fixture per (home, away, calendar day)
CREATE UNIQUE INDEX uq_matches_fixture_per_day ON matches (home_team_id, away_team_id, substr(match_date, 1, 10));
CREATE INDEX idx_matches_league ON matches (league_id, match_date);
CREATE INDEX idx_matches_referee ON matches (referee_id, match_date);

-- How the referee performed in this match (ARIS's analytics, 1:1 with matches).
CREATE TABLE match_officiating (
  match_id          TEXT PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  arps_for_match    REAL NOT NULL,
  rmcs              REAL NOT NULL,
  pressure_avg      REAL NOT NULL,
  physical          TEXT NOT NULL DEFAULT '{}',   -- JSON
  pressure_timeline TEXT NOT NULL DEFAULT '[]',   -- JSON
  -- referee presence samples in metres on a 105 × 68 pitch: [{x, y, intensity}] (from the tracking feed)
  heat_points       TEXT NOT NULL DEFAULT '[]'
);

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

