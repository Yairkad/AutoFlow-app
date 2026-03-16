-- Phase 17: Billing Accounts
-- Replaces old simple billing_tenants/billing_payments with a full system

DROP TABLE IF EXISTS billing_payments CASCADE;
DROP TABLE IF EXISTS billing_tenants  CASCADE;

-- ── billing_items: recurring item templates ────────────────────────────────
CREATE TABLE billing_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           text NOT NULL,
  direction      text NOT NULL CHECK (direction IN ('expense','income')),
  type           text NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed','meter')),
  amount         numeric(10,2),        -- fixed: monthly amount
  price_per_unit numeric(10,4),        -- meter: ₪ per unit
  contact_name   text,                 -- who pays / who receives
  valid_from     text NOT NULL,        -- YYYY-MM  (rate effective from)
  active         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

-- ── billing_entries: monthly record per item (or one-off) ─────────────────
CREATE TABLE billing_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_item_id uuid REFERENCES billing_items(id) ON DELETE SET NULL,
  month          text NOT NULL,        -- YYYY-MM
  direction      text NOT NULL CHECK (direction IN ('expense','income')),
  name           text NOT NULL,
  amount         numeric(10,2) NOT NULL,
  meter_prev     numeric(10,2),
  meter_curr     numeric(10,2),
  price_per_unit numeric(10,4),
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- ── billing_entry_payments: payment history per entry ─────────────────────
CREATE TABLE billing_entry_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_id   uuid NOT NULL REFERENCES billing_entries(id) ON DELETE CASCADE,
  amount     numeric(10,2) NOT NULL,
  paid_date  date NOT NULL DEFAULT CURRENT_DATE,
  notes      text,
  created_at timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE billing_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_entry_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_billing_items" ON billing_items
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_billing_entries" ON billing_entries
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_billing_entry_payments" ON billing_entry_payments
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
