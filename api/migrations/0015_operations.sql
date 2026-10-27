-- ARIS — staff operations: corrections, settled advances, dated fee scales, appeal outcomes, stadium photos.
--
-- Additive only: new tables, new nullable columns and indexes. Nothing existing is rewritten.

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

-- A paid line is history and is never edited. What was paid wrong is put right by a correction line
-- linked to it: a positive delta is owed on top, a negative one is taken back. Append-only, like the audit trail.
CREATE TABLE payment_corrections (
  id          TEXT PRIMARY KEY,
  payment_id  TEXT NOT NULL REFERENCES payments (id),
  delta       INTEGER NOT NULL CHECK (delta <> 0),
  reason      TEXT NOT NULL CHECK (length(reason) >= 3),
  created_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_payment_corrections_payment ON payment_corrections (payment_id, created_at);
CREATE TRIGGER payment_corrections_no_update BEFORE UPDATE ON payment_corrections
BEGIN SELECT RAISE(ABORT, 'payment_corrections is append-only'); END;
CREATE TRIGGER payment_corrections_no_delete BEFORE DELETE ON payment_corrections
BEGIN SELECT RAISE(ABORT, 'payment_corrections is append-only'); END;

-- An advance already paid out is settled by deducting it from one of the official's payment lines.
ALTER TABLE advances ADD COLUMN payment_id TEXT REFERENCES payments (id);
CREATE INDEX idx_advances_payment ON advances (payment_id) WHERE payment_id IS NOT NULL;

-- Fee scales keep their history: one row per (scale, effective_from). The scale applied to a match is the
-- most recent one in force on the match date.
DROP INDEX uq_fee_scales;
CREATE UNIQUE INDEX uq_fee_scales ON fee_scales (IFNULL(federation_id, ''), tier, role, IFNULL(competition_id, ''), effective_from);

-- Receipts attached to a payment line (documents.payment_id) and document expiry alerts.
CREATE INDEX idx_documents_payment ON documents (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_documents_expires ON documents (expires_on) WHERE expires_on IS NOT NULL;

/* ------------------------------------------------------------------ *
 * Discipline
 * ------------------------------------------------------------------ */

-- The ruling on an appeal, kept beside the first-instance decision (original_sanction keeps what was decided first).
ALTER TABLE disciplinary_cases ADD COLUMN appeal_outcome TEXT CHECK (appeal_outcome IS NULL OR appeal_outcome IN ('upheld', 'overturned', 'varied'));
ALTER TABLE disciplinary_cases ADD COLUMN appeal_decision TEXT;
ALTER TABLE disciplinary_cases ADD COLUMN appeal_decided_by TEXT REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE disciplinary_cases ADD COLUMN appeal_decided_at TEXT;
ALTER TABLE disciplinary_cases ADD COLUMN original_sanction TEXT CHECK (original_sanction IS NULL OR original_sanction IN ('warning', 'suspension', 'removal', 'none'));
-- what the official was before a 'removal', so overturning it on appeal puts them back
ALTER TABLE disciplinary_cases ADD COLUMN status_before_removal TEXT;

-- an incident's description can be corrected (by its author or staff) until a case is opened on it
ALTER TABLE incidents ADD COLUMN edited_at TEXT;

/* ------------------------------------------------------------------ *
 * Stadiums
 * ------------------------------------------------------------------ */

ALTER TABLE stadiums ADD COLUMN photo_media_id TEXT REFERENCES media_assets (id) ON DELETE SET NULL;
