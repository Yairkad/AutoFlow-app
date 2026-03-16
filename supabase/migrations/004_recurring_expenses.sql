-- ===================================================
-- AutoFlow – Migration 004: Recurring Expenses
-- ===================================================

CREATE TABLE recurring_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description  text NOT NULL,
  category     text DEFAULT 'אחר',
  amount       numeric(10,2),           -- NULL when is_variable = true
  is_variable  boolean DEFAULT false,   -- true = prompt user each month
  supplier_id  uuid,
  frequency    text DEFAULT 'monthly',  -- 'monthly' | 'bimonthly'
  is_active    boolean DEFAULT true,
  last_applied text,                    -- 'YYYY-MM' of last applied month
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_expenses_tenant_isolation" ON recurring_expenses
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
