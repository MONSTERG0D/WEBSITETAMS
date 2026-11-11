-- THE AAMIR SHEIKH - database schema, migration 0001 (backend foundation)
-- Engine: Cloudflare D1 (SQLite). Safe to run more than once.
--
-- Conventions used in every table
--   ids      TEXT, random, made by the server
--   times    INTEGER, Unix seconds, UTC
--   money    INTEGER in the smallest unit (paise for INR) plus a currency code, never decimals
--   *_json   TEXT that holds JSON
--   No passwords are stored anywhere. Sign-in is Google or a one-time email code.

-- ---------------------------------------------------------------- bookkeeping
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  applied_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- Small key/value notes about this database. 'env' says whether it is the live or the preview one.
CREATE TABLE IF NOT EXISTS app_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- ---------------------------------------------------------------- users
-- One row per person. A deleted account keeps its row (orders and payments still point at it)
-- but its personal details are wiped and status becomes 'deleted'.
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL COLLATE NOCASE,
  email_verified  INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  name            TEXT,
  google_sub      TEXT,
  signup_method   TEXT NOT NULL CHECK (signup_method IN ('google', 'email')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  lang            TEXT,
  created_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at      INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  last_login_at   INTEGER,
  deleted_at      INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq      ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uq ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX        IF NOT EXISTS users_created_idx   ON users (created_at);

-- ---------------------------------------------------------------- sessions
-- A signed-in browser (client 'web') or, later, the game (client 'game').
-- Only a SHA-256 hash of the session token is kept. The token itself lives in the visitor's cookie.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  client        TEXT NOT NULL DEFAULT 'web',
  method        TEXT NOT NULL CHECK (method IN ('google', 'email')),
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  last_seen_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_uq    ON sessions (token_hash);
CREATE INDEX        IF NOT EXISTS sessions_user_idx    ON sessions (user_id);
CREATE INDEX        IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- ---------------------------------------------------------------- login_events
-- Append-only history of sign-in activity. Also what rate limits are counted from.
-- The visitor's IP address is never stored, only a keyed hash of it.
CREATE TABLE IF NOT EXISTS login_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  email       TEXT COLLATE NOCASE,
  method      TEXT NOT NULL CHECK (method IN ('google', 'email')),
  event       TEXT NOT NULL CHECK (event IN ('code_sent', 'signup', 'login', 'logout', 'failed')),
  reason      TEXT,
  ip_hash     TEXT,
  country     TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);
CREATE INDEX IF NOT EXISTS login_events_user_idx  ON login_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS login_events_email_idx ON login_events (email, created_at);
CREATE INDEX IF NOT EXISTS login_events_ip_idx    ON login_events (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS login_events_time_idx  ON login_events (created_at);

-- ---------------------------------------------------------------- services
-- The fixed-price list. The server reads prices from here, never from the browser.
CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  summary      TEXT,
  price_minor  INTEGER NOT NULL CHECK (price_minor >= 0),
  currency     TEXT NOT NULL DEFAULT 'INR',
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);

-- ---------------------------------------------------------------- orders
-- kind 'fixed'  : a service from the list, price known at once, starts as 'pending'
-- kind 'custom' : the order form, starts as 'requested' with no price until the admin sets one
-- 'pending' means waiting for payment or for the payment to be checked.
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  ref           TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind          TEXT NOT NULL CHECK (kind IN ('fixed', 'custom')),
  service_id    TEXT REFERENCES services (id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  brief         TEXT,
  form_json     TEXT CHECK (form_json IS NULL OR json_valid(form_json)),
  amount_minor  INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  status        TEXT NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested', 'pending', 'paid', 'in_progress', 'delivered', 'cancelled', 'refunded')),
  admin_note    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  priced_at     INTEGER,
  paid_at       INTEGER,
  closed_at     INTEGER,
  CHECK (amount_minor IS NOT NULL OR status IN ('requested', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_ref_uq     ON orders (ref);
CREATE INDEX        IF NOT EXISTS orders_user_idx   ON orders (user_id, created_at);
CREATE INDEX        IF NOT EXISTS orders_status_idx ON orders (status, created_at);
CREATE INDEX        IF NOT EXISTS orders_time_idx   ON orders (created_at);

-- ---------------------------------------------------------------- payments
-- One row per payment attempt. provider is 'upi' today (the admin confirms by hand).
-- A gateway such as Razorpay can be added later as another provider value, using
-- provider_order_id and provider_json, with no change to this table.
-- reference is the UPI reference number the customer types in (or the gateway payment id).
CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  user_id            TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  provider           TEXT NOT NULL DEFAULT 'upi',
  amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
  currency           TEXT NOT NULL DEFAULT 'INR',
  status             TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('created', 'submitted', 'confirmed', 'rejected', 'failed', 'refunded')),
  reference          TEXT,
  provider_order_id  TEXT,
  provider_json      TEXT CHECK (provider_json IS NULL OR json_valid(provider_json)),
  note               TEXT,
  confirmed_by       TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at         INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  confirmed_at       INTEGER
);
CREATE INDEX IF NOT EXISTS payments_order_idx  ON payments (order_id);
CREATE INDEX IF NOT EXISTS payments_user_idx   ON payments (user_id, created_at);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status, created_at);
-- The same reference number cannot be used for two live payments.
CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_uq ON payments (provider, reference)
  WHERE reference IS NOT NULL AND status NOT IN ('rejected', 'failed');

-- ---------------------------------------------------------------- audit_log
-- Append-only record of who did what: price set, payment confirmed, account deleted, and so on.
-- action is a dotted name such as 'order.priced' or 'payment.confirmed'.
CREATE TABLE IF NOT EXISTS audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_user_id  TEXT REFERENCES users (id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT,
  entity_id      TEXT,
  data_json      TEXT CHECK (data_json IS NULL OR json_valid(data_json)),
  ip_hash        TEXT,
  created_at     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER))
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS audit_actor_idx  ON audit_log (actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS audit_time_idx   ON audit_log (created_at);

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, 'init');
