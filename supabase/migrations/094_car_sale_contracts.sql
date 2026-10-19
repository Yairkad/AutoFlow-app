-- ════════════════════════════════════════════
-- AutoFlow – Migration 094: Car sale contracts
--   • car_sale_contracts     — saved contracts (history), optionally linked to a car
--   • car_contract_settings  — per-tenant quick-fill seller details + default clause wording
-- Safe to run more than once.
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS car_sale_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  car_id          UUID REFERENCES cars(id) ON DELETE SET NULL,
  -- denormalized for the history list / search
  plate           TEXT,
  car_desc        TEXT,
  seller_name     TEXT,
  buyer_name      TEXT,
  contract_date   DATE,
  total_price     TEXT,
  -- draft → signed
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed')),
  -- full contract content (parties, car, payment, checks, clauses)
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_sale_contracts_tenant ON car_sale_contracts(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_car_sale_contracts_car    ON car_sale_contracts(car_id) WHERE car_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS car_contract_settings (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- the user's own details { name, idNum, phone, address, location } — quick-fill into seller or buyer
  seller      JSONB,
  -- default clause wording: [{ id, kind, title, items[] }]
  clauses     JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE car_sale_contracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_contract_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "car_sale_contracts_tenant" ON car_sale_contracts;
CREATE POLICY "car_sale_contracts_tenant" ON car_sale_contracts
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "car_contract_settings_tenant" ON car_contract_settings;
CREATE POLICY "car_contract_settings_tenant" ON car_contract_settings
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
