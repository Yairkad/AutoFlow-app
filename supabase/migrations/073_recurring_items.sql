-- Recurring billing templates (rent/arnona/electricity meter, etc.), generalized to
-- any supplier OR customer -- replaces the standalone billing_items table. Additive
-- only: nothing reads/writes this yet, billing keeps working unmodified after this.
CREATE TABLE recurring_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           text NOT NULL,
  supplier_id    uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES customers(id) ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed','meter')),
  amount         numeric(10,2),
  price_per_unit numeric(10,4),
  fixed_addon    numeric(10,2),
  valid_from     text NOT NULL,
  active         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT recurring_items_exactly_one_party CHECK (
    (supplier_id IS NOT NULL AND customer_id IS NULL) OR
    (supplier_id IS NULL AND customer_id IS NOT NULL)
  )
);

ALTER TABLE recurring_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_items_tenant_isolation" ON recurring_items
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX idx_recurring_items_supplier ON recurring_items(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_recurring_items_customer ON recurring_items(customer_id) WHERE customer_id IS NOT NULL;

-- Debt-line columns needed to (a) mark a row as generated from a recurring_item
-- and (b) carry meter-reading detail. Nullable, unused by every existing row.
ALTER TABLE supplier_debts
  ADD COLUMN IF NOT EXISTS recurring_item_id uuid REFERENCES recurring_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meter_prev     numeric(10,2),
  ADD COLUMN IF NOT EXISTS meter_curr     numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_per_unit numeric(10,4),
  ADD COLUMN IF NOT EXISTS fixed_addon    numeric(10,2),
  ADD COLUMN IF NOT EXISTS period_start   date,
  ADD COLUMN IF NOT EXISTS period_end     date;

ALTER TABLE customer_ledger_debts
  ADD COLUMN IF NOT EXISTS recurring_item_id uuid REFERENCES recurring_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meter_prev     numeric(10,2),
  ADD COLUMN IF NOT EXISTS meter_curr     numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_per_unit numeric(10,4),
  ADD COLUMN IF NOT EXISTS fixed_addon    numeric(10,2),
  ADD COLUMN IF NOT EXISTS period_start   date,
  ADD COLUMN IF NOT EXISTS period_end     date;
