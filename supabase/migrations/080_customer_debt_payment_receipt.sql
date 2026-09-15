-- Lets a customer_debts payment record whether a receipt (קבלה) was issued
-- for it and its number, mirroring customer_ledger_payments.receipt_number.
ALTER TABLE customer_debt_payments
  ADD COLUMN IF NOT EXISTS receipt_issued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_number text;
