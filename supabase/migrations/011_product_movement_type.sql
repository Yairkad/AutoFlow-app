-- ===================================================
-- AutoFlow – Migration 011: product_sales movement type
-- ===================================================

ALTER TABLE product_sales
  ADD COLUMN IF NOT EXISTS movement_type text DEFAULT 'sale'
    CHECK (movement_type IN ('sale', 'order'));
