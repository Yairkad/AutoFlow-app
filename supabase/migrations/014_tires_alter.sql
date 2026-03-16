-- ================================================================
-- AutoFlow – Migration 014: Fix tires table (align with Phase 9)
-- ================================================================

-- Rename diameter → rim
ALTER TABLE tires RENAME COLUMN diameter TO rim;

-- Rename buy_price → cost_price
ALTER TABLE tires RENAME COLUMN buy_price TO cost_price;

-- Add missing columns
ALTER TABLE tires
  ADD COLUMN IF NOT EXISTS load_idx   text,
  ADD COLUMN IF NOT EXISTS speed_idx  text,
  ADD COLUMN IF NOT EXISTS margin     numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location   text,
  ADD COLUMN IF NOT EXISTS notes      text;

-- tire_sales table (013 may have already created it, safe to skip)
CREATE TABLE IF NOT EXISTS tire_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tire_id       uuid NOT NULL REFERENCES tires(id) ON DELETE CASCADE,
  qty           integer NOT NULL,
  movement_type text NOT NULL DEFAULT 'sale'
    CHECK (movement_type IN ('sale', 'order')),
  sold_date     date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE tire_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tire_sales_tenant_isolation" ON tire_sales;
CREATE POLICY "tire_sales_tenant_isolation" ON tire_sales
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
