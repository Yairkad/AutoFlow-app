-- Simple payment records against customer_ledger_debts. Deliberately has
-- no scheduled_payment_id / series concept — per product decision,
-- customers use direct payment recording only (no incoming check-series
-- calendar system). check_number/check_date are plain optional fields
-- captured on a single payment when payment_method = 'צ'ק'.
CREATE TABLE customer_ledger_payments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_ledger_debt_id uuid NOT NULL REFERENCES customer_ledger_debts(id) ON DELETE CASCADE,
  amount                  numeric(10,2) NOT NULL,
  payment_method          text NOT NULL DEFAULT 'מזומן',
  check_number            text,
  check_date              date,
  notes                   text,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE customer_ledger_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_ledger_payments_tenant_isolation" ON customer_ledger_payments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
