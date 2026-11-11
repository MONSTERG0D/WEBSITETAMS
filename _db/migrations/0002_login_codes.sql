-- THE AAMIR SHEIKH - database schema, migration 0002 (sign-in with an emailed code)
-- Safe to run more than once.

-- ---------------------------------------------------------------- login_codes
-- One row per 6-digit code sent by email. The code itself is never stored, only a keyed hash.
-- A code works for 10 minutes, once, and is retired after 5 wrong tries.
CREATE TABLE IF NOT EXISTS login_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL COLLATE NOCASE,
  code_hash   TEXT NOT NULL,
  ip_hash     TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx   ON login_codes (email, created_at);
CREATE INDEX IF NOT EXISTS login_codes_expires_idx ON login_codes (expires_at);

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (2, 'login_codes');
