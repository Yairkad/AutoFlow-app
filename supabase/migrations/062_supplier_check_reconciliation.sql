-- Check number/series bookkeeping, and an explicit (user-chosen) ledger of which
-- check paid off which part of which supplier debt — replaces the fragile
-- due-date-month heuristic with a real link.
ALTER TABLE scheduled_payments
  ADD COLUMN IF NOT EXISTS check_number text,
  ADD COLUMN IF NOT EXISTS series_id   uuid;

CREATE TABLE supplier_debt_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_debt_id      uuid NOT NULL REFERENCES supplier_debts(id) ON DELETE CASCADE,
  scheduled_payment_id  uuid REFERENCES scheduled_payments(id) ON DELETE SET NULL,
  amount                numeric(10,2) NOT NULL,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE supplier_debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_debt_payments_tenant_isolation" ON supplier_debt_payments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
