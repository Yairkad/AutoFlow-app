-- ════════════════════════════════════════════
-- Yard POS Terminal
-- ════════════════════════════════════════════

-- Active & historical car sessions in the yard
CREATE TABLE yard_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate       TEXT NOT NULL,
  make        TEXT,
  model       TEXT,
  year        TEXT,
  -- active → pending_office → archived
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','pending_office','archived')),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by   UUID REFERENCES auth.users(id),
  closed_at   TIMESTAMPTZ,
  closed_by   UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_yard_sessions_tenant_status ON yard_sessions(tenant_id, status);
CREATE INDEX idx_yard_sessions_opened_at     ON yard_sessions(opened_at);

-- Items added to a session (tires, products, services)
CREATE TABLE yard_session_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES yard_sessions(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_type      TEXT NOT NULL CHECK (item_type IN ('tire','product','service')),
  ref_id         UUID,          -- nullable: tires.id / products.id / yard_services.id
  name           TEXT NOT NULL,
  sku            TEXT,
  quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  original_price NUMERIC(10,2),
  price_modified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_yard_items_session ON yard_session_items(session_id);
CREATE INDEX idx_yard_items_tenant  ON yard_session_items(tenant_id);

-- Services catalogue (airbag sensor, balancing, etc.) — managed by office
CREATE TABLE yard_services (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sku        TEXT,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_yard_services_tenant ON yard_services(tenant_id, is_active, sort_order);

-- ── RLS ──────────────────────────────────────

ALTER TABLE yard_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE yard_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE yard_services      ENABLE ROW LEVEL SECURITY;

-- yard_sessions
CREATE POLICY "yard_sessions_tenant" ON yard_sessions
  USING  (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- yard_session_items
CREATE POLICY "yard_items_tenant" ON yard_session_items
  USING  (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- yard_services
CREATE POLICY "yard_services_tenant" ON yard_services
  USING  (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ── Realtime ─────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE yard_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE yard_session_items;
