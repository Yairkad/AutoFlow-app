-- ===================================================
-- AutoFlow – Migration 005: Scheduled Payments & Dynamic Categories
-- ===================================================

-- ── Add payment method columns to expenses ────────────────────────────────
-- payment_method: 'מזומן' | 'אשראי' | 'צ\'ק' | 'העברה'
-- payment_ref:    optional (check number / transfer reference)

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'מזומן',
  ADD COLUMN IF NOT EXISTS payment_ref    text;

-- ── Scheduled payments (post-dated checks / bank transfers) ────────────────

CREATE TABLE scheduled_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description    text NOT NULL,
  amount         numeric(10,2) NOT NULL,
  due_date       date NOT NULL,
  payment_method text NOT NULL DEFAULT 'check',  -- 'check' | 'transfer'
  supplier_id    uuid,
  category       text,   -- pre-filled when marking as paid
  is_paid        boolean DEFAULT false,
  paid_date      date,
  expense_id     uuid,   -- set when marked as paid (references expenses row created)
  notes          text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE scheduled_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_payments_tenant_isolation" ON scheduled_payments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ── Dynamic expense categories per tenant ──────────────────────────────────

CREATE TABLE expense_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_categories_tenant_isolation" ON expense_categories
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ── Dynamic income categories per tenant ───────────────────────────────────

CREATE TABLE income_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE income_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "income_categories_tenant_isolation" ON income_categories
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
