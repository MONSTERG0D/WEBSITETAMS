-- THE AAMIR SHEIKH - database schema, migration 0004 (asking for your data to be deleted)
-- Safe to run more than once. Adds one table and changes nothing that is already there.

-- ---------------------------------------------------------------- deletion_requests
-- A signed-in person asks for their data to be deleted. The owner deletes it from the admin page
-- (the privacy page promises within 30 days), or the person changes their mind first.
--   requested  waiting for the owner
--   cancelled  the person pressed "Keep my account"
--   done       deleted. The users row is kept with its personal details wiped, so past orders stay consistent.
CREATE TABLE IF NOT EXISTS deletion_requests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'cancelled', 'done')),
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  closed_at   INTEGER,
  closed_by   TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS deletion_requests_status_idx ON deletion_requests (status, created_at);
-- One open request per person at a time.
CREATE UNIQUE INDEX IF NOT EXISTS deletion_requests_open_uq ON deletion_requests (user_id) WHERE status = 'requested';

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (4, 'deletion_requests');
