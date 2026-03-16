-- ================================================================
-- AutoFlow – Migration 013: Tires (Phase 9)
-- ================================================================

CREATE TABLE IF NOT EXISTS tires (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  brand       text,
  width       integer NOT NULL,
  profile     integer NOT NULL,
  rim         integer NOT NULL,
  load_idx    text,
  speed_idx   text,
  cost_price  numeric(10,2),
  margin      numeric(5,2) DEFAULT 0,
  sell_price  numeric(10,2),
  qty         integer NOT NULL DEFAULT 0,
  location    text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE tires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tires_tenant_isolation" ON tires
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ── Tire sales / movements ────────────────────────────────────────

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

CREATE POLICY "tire_sales_tenant_isolation" ON tire_sales
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
