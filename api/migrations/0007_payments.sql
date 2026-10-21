-- ARIS — fees & payments.
-- Each federation sets its own barème in its own currency; rows without a federation are the platform defaults.


CREATE TABLE fee_scales (
  id              TEXT PRIMARY KEY,
  tier            TEXT NOT NULL CHECK (tier IN ('d1', 'd2', 'cup', 'continental')),
  -- a scale for one competition overrides the tier default
  competition_id  TEXT REFERENCES competitions (id) ON DELETE CASCADE,
  -- NULL = the platform default; otherwise this federation's own scale
  federation_id   TEXT REFERENCES federations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('R', 'AR1', 'AR2', 'FOURTH', 'VAR', 'AVAR', 'OBS')),
  amount          INTEGER NOT NULL CHECK (amount >= 0),
  transport       INTEGER NOT NULL DEFAULT 0 CHECK (transport >= 0),
  lodging         INTEGER NOT NULL DEFAULT 0 CHECK (lodging >= 0),
  meals           INTEGER NOT NULL DEFAULT 0 CHECK (meals >= 0),
  currency        TEXT NOT NULL DEFAULT 'XOF',
  effective_from  TEXT NOT NULL DEFAULT '2026-07-01'
);
CREATE UNIQUE INDEX uq_fee_scales ON fee_scales (IFNULL(federation_id, ''), tier, role, IFNULL(competition_id, ''));

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

