-- ARIS — media registry.
--
-- Every object in the R2 bucket `aris-media` has exactly one row here, so the database
-- knows what the bucket holds (and a missing or orphaned object is detectable).
-- Bytes live in R2 under `r2_key`; this table is the index, the ownership and the policy.
--
--   public   flags, crests, logos — served to anyone
--   private  photos of people, licences, medical certificates, receipts — signed-in, in scope

CREATE TABLE media_assets (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('flag', 'crest', 'logo', 'photo', 'document', 'receipt', 'stadium', 'other')),
  visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf')),
  size          INTEGER NOT NULL CHECK (size BETWEEN 1 AND 8388608),
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64),
  -- what this belongs to, so access follows the owner (no foreign key: owners are of several kinds)
  owner_type    TEXT CHECK (owner_type IN ('country', 'federation', 'team', 'stadium', 'official', 'payment')),
  owner_id      TEXT,
  uploaded_by   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- scalable vector graphics can carry script: only the platform's own seed may store them (no uploader),
  -- and they are always served sandboxed. User uploads are PDF / PNG / JPEG / WebP only.
  CHECK (content_type <> 'image/svg+xml' OR uploaded_by IS NULL)
);
CREATE INDEX idx_media_owner ON media_assets (owner_type, owner_id);
