-- ===================================================
-- AutoFlow – Migration 009: Employee Start & End Dates
-- ===================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date   date;   -- NULL = still employed
