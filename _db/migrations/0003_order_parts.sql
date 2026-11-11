-- THE AAMIR SHEIKH - database schema, migration 0003 (orders paid in one or more parts)
-- Safe to run more than once. Adds one table and changes nothing that is already there.

-- ---------------------------------------------------------------- order_parts
-- What the customer pays for an order, one row per part.
-- A small order has one part. A big one is split by the owner into an advance, milestones and a final part,
-- because UPI apps usually allow about 1 lakh rupees a day.
--   locked  not asked for yet (a later milestone)
--   due     the customer can pay it now
--   paid    the owner confirmed the payment
--   void    replaced by a new price, or the order was cancelled
-- payment_id points at the payment that settles this part (filled in by the UPI step).
CREATE TABLE IF NOT EXISTS order_parts (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL CHECK (seq >= 1),
  amount_minor  INTEGER NOT NULL CHECK (amount_minor > 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  status        TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'due', 'paid', 'void')),
  payment_id    TEXT REFERENCES payments (id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  updated_at    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER)),
  due_at        INTEGER,
  paid_at       INTEGER
);
CREATE INDEX IF NOT EXISTS order_parts_order_idx ON order_parts (order_id, seq);
CREATE INDEX IF NOT EXISTS order_parts_status_idx ON order_parts (status, due_at);
-- Only one live part per position in an order. Old, replaced parts are kept as 'void'.
CREATE UNIQUE INDEX IF NOT EXISTS order_parts_live_uq ON order_parts (order_id, seq) WHERE status <> 'void';

INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (3, 'order_parts');
