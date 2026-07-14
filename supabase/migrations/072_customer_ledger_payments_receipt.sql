-- Tracks whether a receipt (קבלה) has been issued for a recorded customer payment.
ALTER TABLE customer_ledger_payments ADD COLUMN IF NOT EXISTS receipt_issued boolean NOT NULL DEFAULT false;
