-- ARIS — geography & competitions.
--
-- Shapes follow AfriScout so data can move between the two systems:
--   countries     ≈ supported_countries  (ISO alpha-3 canonical, admin-managed `active` flag, flag picture)
--   teams         ≈ teams                (unique per lower(name) + country; clubs and national sides)
--   stadiums      ≈ federation_stadiums
--   competitions  ≈ leagues              (a competition + season; matches.league_id points here)

CREATE TABLE countries (
  code            TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),  -- ISO 3166-1 alpha-3
  iso2            TEXT NOT NULL UNIQUE CHECK (length(iso2) = 2 AND iso2 = upper(iso2)),
  name            TEXT NOT NULL,                  -- English
  name_fr         TEXT NOT NULL,
  name_es         TEXT NOT NULL,
  name_de         TEXT NOT NULL,
  flag            TEXT NOT NULL DEFAULT '',       -- emoji, the fallback when no picture is uploaded
  flag_media_id   TEXT REFERENCES media_assets (id) ON DELETE SET NULL,
  zone            TEXT NOT NULL CHECK (zone IN ('UNAF', 'UFOA-A', 'UFOA-B', 'UNIFFAC', 'CECAFA', 'COSAFA')),
  capital         TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'UTC',    -- IANA name; fixtures are stored in UTC and shown here
  currency        TEXT NOT NULL DEFAULT 'XOF',    -- ISO 4217
  -- a supported country has a federation portal and takes part in designations
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sync_source     TEXT NOT NULL DEFAULT 'Manual entry' CHECK (sync_source IN ('COMET', 'League feed', 'Manual entry')),
  sync_health     TEXT NOT NULL DEFAULT 'manual' CHECK (sync_health IN ('healthy', 'stale', 'manual')),
  last_sync_hours INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE stadiums (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  city      TEXT NOT NULL,
  country   TEXT NOT NULL REFERENCES countries (code),
  capacity  INTEGER CHECK (capacity IS NULL OR capacity > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX uq_stadiums_name_city ON stadiums (name COLLATE NOCASE, city COLLATE NOCASE, country);

CREATE TABLE teams (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  short_name      TEXT,
  -- a club, or a national side (continental ties are played between nations)
  kind            TEXT NOT NULL DEFAULT 'club' CHECK (kind IN ('club', 'national')),
  country         TEXT NOT NULL REFERENCES countries (code),
  city            TEXT,
  stadium_id      TEXT REFERENCES stadiums (id) ON DELETE SET NULL,
  logo_media_id   TEXT REFERENCES media_assets (id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- AfriScout: Teams → (lower(name), country)
CREATE UNIQUE INDEX uq_teams_name_country ON teams (name COLLATE NOCASE, country, kind);
CREATE INDEX idx_teams_country ON teams (country);

CREATE TABLE competitions (
  id               TEXT PRIMARY KEY,
  -- a supported country's code, or 'CAF' for continental competitions (so no foreign key)
  country_code     TEXT NOT NULL,
  name             TEXT NOT NULL,
  short_name       TEXT,
  tier             TEXT NOT NULL CHECK (tier IN ('d1', 'd2', 'cup', 'continental')),
  gender           TEXT NOT NULL CHECK (gender IN ('M', 'W')),
  -- canonical season label, "YYYY/YYYY" (AfriScout: ck_matches_season_format)
  season           TEXT NOT NULL CHECK (season GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  matchdays        INTEGER NOT NULL CHECK (matchdays >= 1),
  current_matchday INTEGER NOT NULL CHECK (current_matchday >= 0),
  var_enabled      INTEGER NOT NULL CHECK (var_enabled IN (0, 1)),
  weight           REAL NOT NULL,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);
CREATE INDEX idx_competitions_country ON competitions (country_code);
