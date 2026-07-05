-- Link a materialized expense back to the recurring template it came from,
-- and allow a one-time expense to be prorated evenly across N months for reporting.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amortize_months smallint;
