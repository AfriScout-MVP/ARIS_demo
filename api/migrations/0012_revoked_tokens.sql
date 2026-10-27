-- ARIS — signed-out sessions.
--
-- A session token is stateless (HS256, 12 hours), so signing out used to only drop the cookie: a copy of the token
-- kept working until it expired. Each token now carries an id (`jti`); signing out writes it here and every request
-- refuses a token listed here. Rows are only needed until the token would have expired anyway; the daily job prunes them.

CREATE TABLE revoked_tokens (
  jti         TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- the token's own expiry (unix seconds): after it, the token is refused anyway and the row can go
  expires_at  INTEGER NOT NULL,
  revoked_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens (expires_at);
