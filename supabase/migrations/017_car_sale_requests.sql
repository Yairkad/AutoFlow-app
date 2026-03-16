-- ================================================================
-- AutoFlow – Migration 017: Car sale requests
-- ================================================================

CREATE TABLE IF NOT EXISTS car_sale_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  make            text,
  model           text,
  year            integer,
  plate           text,
  car_code        text,
  key_hanger      text,
  list_price      numeric(10,2),
  commission      numeric(10,2),
  commission_type text NOT NULL DEFAULT 'fixed' CHECK (commission_type IN ('fixed', 'percent')),
  wait_until      date,
  status          text NOT NULL DEFAULT 'open',
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE car_sale_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "car_sale_requests_tenant_isolation" ON car_sale_requests
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
