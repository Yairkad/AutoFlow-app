-- ===================================================
-- AutoFlow – Migration 010: Products extra fields + product_sales
-- ===================================================

-- Add missing columns to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit      text          DEFAULT 'יח׳',
  ADD COLUMN IF NOT EXISTS unit_qty  numeric(10,2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS margin    numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_qty   integer       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes     text;

-- Sales history per product (used for monthly sold stats)
CREATE TABLE IF NOT EXISTS product_sales (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        numeric(10,2) NOT NULL,
  sold_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_sales_tenant_isolation" ON product_sales
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
