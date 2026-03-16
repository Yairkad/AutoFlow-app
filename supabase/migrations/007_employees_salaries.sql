-- ===================================================
-- AutoFlow – Migration 007: Employees & Salaries Upgrade
-- ===================================================

-- ── Extend employees table ────────────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS email        text,
  ADD COLUMN IF NOT EXISTS hourly_rate  numeric(10,2),
  ADD COLUMN IF NOT EXISTS role_level   text DEFAULT 'employee',  -- 'admin' | 'employee'
  ADD COLUMN IF NOT EXISTS bank_name    text,
  ADD COLUMN IF NOT EXISTS bank_branch  text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_holder  text,
  ADD COLUMN IF NOT EXISTS id_number    text,
  ADD COLUMN IF NOT EXISTS birth_date   date,
  ADD COLUMN IF NOT EXISTS address      text,
  ADD COLUMN IF NOT EXISTS shirt_size   text,
  ADD COLUMN IF NOT EXISTS pants_size   text,
  ADD COLUMN IF NOT EXISTS shoe_size    text,
  ADD COLUMN IF NOT EXISTS notes        text;

-- ── Rebuild salaries table columns ───────────────────────────────────────────
-- Remove old flat numeric columns (bonus, deductions) and replace with jsonb arrays.
-- Also add hours, payment tracking, and expense linkage.

ALTER TABLE salaries
  DROP COLUMN IF EXISTS bonus,
  DROP COLUMN IF EXISTS deductions;

ALTER TABLE salaries
  ADD COLUMN IF NOT EXISTS hours          numeric(6,2)   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additions      jsonb          DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS deductions     jsonb          DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_method text,                        -- 'העברה' | 'מזומן' | 'צ\'ק'
  ADD COLUMN IF NOT EXISTS payment_ref    text,                        -- optional reference / check number
  ADD COLUMN IF NOT EXISTS paid_date      date,
  ADD COLUMN IF NOT EXISTS expense_id     uuid,                        -- set when marked paid → points to expenses row
  ADD COLUMN IF NOT EXISTS notes          text;
