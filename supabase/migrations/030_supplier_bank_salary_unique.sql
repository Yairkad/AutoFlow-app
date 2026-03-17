-- ══════════════════════════════════════════════════════════════════════════
-- 030 · Supplier bank payment details + salary unique constraint
-- ══════════════════════════════════════════════════════════════════════════

-- Add bank account fields to suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS bank_name           text,
  ADD COLUMN IF NOT EXISTS bank_branch         text,
  ADD COLUMN IF NOT EXISTS bank_account        text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text;

-- Unique constraint on salaries (employee_id, month) to allow upsert-based auto-init
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salaries_employee_month_unique'
  ) THEN
    ALTER TABLE salaries ADD CONSTRAINT salaries_employee_month_unique UNIQUE (employee_id, month);
  END IF;
END $$;
