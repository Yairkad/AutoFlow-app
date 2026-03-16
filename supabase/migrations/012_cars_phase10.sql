-- ================================================================
-- AutoFlow – Migration 012: Cars Phase 10
-- Extends cars table + adds car_requests table
-- ================================================================

-- ── Extend existing cars table ────────────────────────────────────
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS km                integer,
  ADD COLUMN IF NOT EXISTS condition         text DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS ask_price         numeric(10,2),
  ADD COLUMN IF NOT EXISTS test_date         date,
  ADD COLUMN IF NOT EXISTS insur_date        date,
  ADD COLUMN IF NOT EXISTS contact           text,
  ADD COLUMN IF NOT EXISTS owner_name        text,
  ADD COLUMN IF NOT EXISTS photos            jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS fuel_type         text,
  ADD COLUMN IF NOT EXISTS seats             integer,
  ADD COLUMN IF NOT EXISTS sold_date         date,
  ADD COLUMN IF NOT EXISTS sold_price        numeric(10,2),
  ADD COLUMN IF NOT EXISTS buyer_name        text,
  ADD COLUMN IF NOT EXISTS buyer_phone       text,
  ADD COLUMN IF NOT EXISTS buyer_payment     text,
  ADD COLUMN IF NOT EXISTS interested_buyers jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- Migrate legacy status 'inventory' → 'available'
UPDATE cars SET status = 'available' WHERE status = 'inventory';
ALTER TABLE cars ALTER COLUMN status SET DEFAULT 'available';

-- ── car_requests table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS car_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  budget      numeric(10,2),
  min_year    integer,
  max_km      integer,
  seats       text,
  car_type    text,
  fuel        text,
  make_pref   text,
  status      text DEFAULT 'open',   -- open | handled | closed
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE car_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "car_requests_tenant_isolation" ON car_requests
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
