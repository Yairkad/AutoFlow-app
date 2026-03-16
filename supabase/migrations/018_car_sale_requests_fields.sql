-- ================================================================
-- AutoFlow – Migration 018: Car sale requests extra fields
-- ================================================================

ALTER TABLE car_sale_requests
  ADD COLUMN IF NOT EXISTS km             integer,
  ADD COLUMN IF NOT EXISTS hand           integer,
  ADD COLUMN IF NOT EXISTS ownership_type text;
