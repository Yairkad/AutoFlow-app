-- Recurring (fixed) expenses get their own payment method. Before this, the monthly auto-insert
-- omitted payment_method, so expenses.payment_method's DEFAULT 'מזומן' marked every recurring
-- expense as cash. NULL = not set (the generated expense then gets no payment method either).
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS payment_method text;

-- Recurring expenses are almost never cash: clear the default-filled 'מזומן' on generated rows.
UPDATE expenses SET payment_method = NULL
WHERE recurring_expense_id IS NOT NULL AND payment_method = 'מזומן' AND payment_ref IS NULL;
