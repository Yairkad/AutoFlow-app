-- Customer ledger moves from "payment allocated to specific invoices" to a simple running
-- total: Σcharges − Σcredits − Σpayments, computed straight from raw amounts (see the 2026-08-18
-- redesign — is_closed/paid per invoice repeatedly caused real balance bugs when the two drifted
-- independently, e.g. bug-020). A payment no longer needs to belong to a specific
-- customer_ledger_debt row, so customer_ledger_debt_id becomes optional and customer_id is added
-- directly so a payment can always be attributed to its customer regardless.
ALTER TABLE customer_ledger_payments
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- Backfill is 100% mechanical for every historical row — every existing payment is already
-- linked to exactly one debt, and every debt belongs to exactly one customer.
UPDATE customer_ledger_payments p
SET customer_id = d.customer_id
FROM customer_ledger_debts d
WHERE d.id = p.customer_ledger_debt_id AND p.customer_id IS NULL;

ALTER TABLE customer_ledger_payments
  ALTER COLUMN customer_ledger_debt_id DROP NOT NULL,
  ALTER COLUMN customer_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_ledger_payments_customer
  ON customer_ledger_payments(customer_id);
