-- ================================================================
-- AutoFlow – Migration 016: Extend quotes table for Phase 11
-- ================================================================

-- Tire-specific fields
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS quote_date  date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS brand       text,
  ADD COLUMN IF NOT EXISTS width       integer,
  ADD COLUMN IF NOT EXISTS profile     integer,
  ADD COLUMN IF NOT EXISTS rim         integer,
  ADD COLUMN IF NOT EXISTS qty         integer DEFAULT 1,
  -- Parts-specific fields
  ADD COLUMN IF NOT EXISTS part_name   text,
  ADD COLUMN IF NOT EXISTS sku         text,
  ADD COLUMN IF NOT EXISTS car_model   text,
  -- Pricing / supplier
  ADD COLUMN IF NOT EXISTS supplier_offers jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cost_price  numeric(10,2),
  ADD COLUMN IF NOT EXISTS sell_price  numeric(10,2),
  ADD COLUMN IF NOT EXISTS profit      numeric(10,2),
  ADD COLUMN IF NOT EXISTS supplier    text,
  ADD COLUMN IF NOT EXISTS notes       text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();

-- Rename 'total' → keep it, not used, harmless

-- Drop 'cars' type from future use (data only – no constraint existed)
-- status already has no check constraint in 003; add 'canceled' is implicit

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_quotes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_updated_at ON quotes;
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_quotes_updated_at();
