-- "Occasional debtors" (customer_debts, the ad-hoc table behind /debts) get:
-- a due date, a call-log, and a per-payment log (method + bank-transfer
-- verification) — mirrors the customer_ledger_payments pattern.

ALTER TABLE customer_debts ADD COLUMN due_date date;

CREATE TABLE customer_debt_calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_debt_id uuid NOT NULL REFERENCES customer_debts(id) ON DELETE CASCADE,
  answered         boolean NOT NULL,
  notes            text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE customer_debt_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_debt_calls_tenant_isolation" ON customer_debt_calls
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- transfer_verified is null for non-transfer payment methods (not applicable);
-- false/true only applies when payment_method = 'העברה'.
CREATE TABLE customer_debt_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_debt_id   uuid NOT NULL REFERENCES customer_debts(id) ON DELETE CASCADE,
  amount             numeric(10,2) NOT NULL,
  payment_date       date NOT NULL,
  payment_method     text NOT NULL DEFAULT 'מזומן',
  reference          text,
  transfer_verified  boolean,
  verified_date      date,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE customer_debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_debt_payments_tenant_isolation" ON customer_debt_payments
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
