-- Lets a customer ledger payment be recorded as an income row, the way a
-- supplier payment inserts an expenses row (see SupplierTrackingClient.submitPayment).
ALTER TABLE income
  ADD COLUMN IF NOT EXISTS customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'מזומן',
  ADD COLUMN IF NOT EXISTS payment_ref    text;
