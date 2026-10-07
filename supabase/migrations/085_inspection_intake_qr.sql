-- Fixed per-business link / QR for the purchase-inspection pre-fill form (alongside the
-- personal per-customer links). Filling the fixed link creates a new car_inspections row,
-- which then gets its own personal intake_token for document uploads and later edits.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS intake_public_token text UNIQUE;

-- 'link' = personal link sent from the office, 'qr' = filled via the fixed business link
ALTER TABLE car_inspections
  ADD COLUMN IF NOT EXISTS intake_source text;
