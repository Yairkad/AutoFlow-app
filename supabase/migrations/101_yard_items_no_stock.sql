-- AutoFlow – Migration 101: items charged on a work card without (enough) stock
--   no_stock          — charged knowingly without stock (shown as "ללא מלאי" on the card)
--   no_stock_qty      — set when the card is closed: units sold beyond what was in stock
--   stock_resolved_at — the office sorted it out against the inventory ("✓ סודר")
-- Safe to run more than once.
ALTER TABLE yard_session_items
  ADD COLUMN IF NOT EXISTS no_stock          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_stock_qty      integer,
  ADD COLUMN IF NOT EXISTS stock_resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_yard_items_no_stock_open
  ON yard_session_items(tenant_id)
  WHERE no_stock_qty > 0 AND stock_resolved_at IS NULL;
