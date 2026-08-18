-- A single "אשר תשלום" click can split one transfer/check across several
-- customer_ledger_debts rows (multi-invoice allocation), each getting its own
-- customer_ledger_payments row (see the 2026-07-14 decision to keep per-debt
-- rows rather than reassembling them). That made the printed/on-screen ledger
-- show one "תשלום" line per invoice the payment happened to cover instead of
-- one line for what the customer actually handed over. payment_group_id lets
-- the UI regroup those rows back into a single printed line without touching
-- the per-debt amounts the reconciliation logic still needs underneath.
ALTER TABLE customer_ledger_payments
  ADD COLUMN IF NOT EXISTS payment_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_customer_ledger_payments_group
  ON customer_ledger_payments(payment_group_id);
