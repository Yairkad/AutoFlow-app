-- ════════════════════════════════════════════
-- AutoFlow – Migration 093: Yard worker hub
--   • tire_loans         — tires borrowed from / lent to other tire shops
--   • customer_requests  — customers waiting for an ordered tire / inquiries
--   • indexes for the quick reports and the tires page
-- Safe to run more than once.
-- ════════════════════════════════════════════

-- ── Loans between tire shops ─────────────────
CREATE TABLE IF NOT EXISTS tire_loans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- borrowed = we took from them, lent = we gave to them
  direction     TEXT NOT NULL CHECK (direction IN ('borrowed','lent')),
  shop_name     TEXT NOT NULL,
  shop_phone    TEXT,
  loan_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  item_desc     TEXT NOT NULL,          -- size / model as typed by the worker
  tire_id       UUID REFERENCES tires(id) ON DELETE SET NULL,
  qty           INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  -- related customer / car (optional)
  customer_name TEXT,
  plate         TEXT,
  session_id    UUID REFERENCES yard_sessions(id) ON DELETE SET NULL,
  -- open → returned (tire came back / we returned it) | paid (settled with money)
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','returned','paid')),
  amount        NUMERIC(10,2),
  closed_at     TIMESTAMPTZ,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tire_loans_tenant_status ON tire_loans(tenant_id, status, loan_date);

-- ── Customers waiting / inquiries ────────────
CREATE TABLE IF NOT EXISTS customer_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- order = customer ordered and waits for it to arrive, inquiry = we need to check for him
  kind            TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order','inquiry')),
  customer_name   TEXT NOT NULL,
  phone           TEXT,
  plate           TEXT,
  item_desc       TEXT NOT NULL,        -- size / product as typed
  -- parsed tire size, used to alert when a matching tire is received
  tire_width      INTEGER,
  tire_profile    INTEGER,
  tire_rim        INTEGER,
  qty             INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  quoted_price    NUMERIC(10,2),
  -- new → ordered → arrived → notified → closed | cancelled
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','ordered','arrived','notified','closed','cancelled')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_requests_tenant_status ON customer_requests(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_requests_size
  ON customer_requests(tenant_id, tire_width, tire_profile, tire_rim)
  WHERE status IN ('new','ordered');

-- ── RLS ──────────────────────────────────────
ALTER TABLE tire_loans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tire_loans_tenant" ON tire_loans;
CREATE POLICY "tire_loans_tenant" ON tire_loans
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "customer_requests_tenant" ON customer_requests;
CREATE POLICY "customer_requests_tenant" ON customer_requests
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ── Speed: indexes used by the tires page and the quick reports ──
CREATE INDEX IF NOT EXISTS idx_tires_tenant             ON tires(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tires_tenant_size        ON tires(tenant_id, width, profile, rim);
CREATE INDEX IF NOT EXISTS idx_tire_sales_tenant_date   ON tire_sales(tenant_id, movement_type, sold_date);
CREATE INDEX IF NOT EXISTS idx_product_sales_tenant_date ON product_sales(tenant_id, movement_type, sold_date);
CREATE INDEX IF NOT EXISTS idx_products_tenant          ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_yard_sessions_closed     ON yard_sessions(tenant_id, status, closed_at);
CREATE INDEX IF NOT EXISTS idx_profiles_id_tenant       ON profiles(id, tenant_id);
