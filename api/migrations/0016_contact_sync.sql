-- ARIS — the landing page's contact form, the printable dossier's contents, and what "data freshness" reads.
--
-- 1. A partnership now says where the lead came from: typed in by an administrator, or sent through the public
--    contact form on the landing page (POST /public/contact).
ALTER TABLE partnerships ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'website'));

-- 2. Throttle for the public contact form: one row per accepted or rejected submission, keyed by a SHA-256 of the
--    caller's IP (the address itself is not kept here). Old rows are only ever counted inside a short window.
CREATE TABLE contact_throttle (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash  TEXT NOT NULL,
  at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_contact_throttle ON contact_throttle (ip_hash, at);

-- 3. A dossier remembers which sections were chosen, so the archive reopens the same document.
ALTER TABLE dossiers ADD COLUMN sections TEXT NOT NULL DEFAULT '[]';   -- JSON array of section ids

-- 4. "Data freshness" per country is the latest real change to its fixtures, matches and reports (see
--    domain/freshness.ts); these indexes keep that MAX() cheap.
CREATE INDEX IF NOT EXISTS idx_matches_updated ON matches (updated_at);
CREATE INDEX IF NOT EXISTS idx_assessments_updated ON assessments (updated_at);
