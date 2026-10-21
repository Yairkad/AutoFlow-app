-- AutoFlow – Migration 100: waiting-customer requests get payment status + supplier
-- Safe to run more than once.
ALTER TABLE customer_requests
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount    numeric(10,2),
  ADD COLUMN IF NOT EXISTS supplier_name  text;

DO $$ BEGIN
  ALTER TABLE customer_requests
    ADD CONSTRAINT customer_requests_payment_status_chk CHECK (payment_status IN ('unpaid','partial','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
