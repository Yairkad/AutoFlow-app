-- Lets a customer-ledger payment record whether a receipt (קבלה) was issued
-- for it and its number, and pins the actual payment date (previously only
-- check_date existed, which is null for non-check methods) so the payment
-- can be placed correctly in the chronological ledger/print view.
ALTER TABLE customer_ledger_payments
  ADD COLUMN IF NOT EXISTS payment_date   date,
  ADD COLUMN IF NOT EXISTS receipt_issued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_number text;
