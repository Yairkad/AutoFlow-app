-- ===================================================
-- AutoFlow – Migration 008: Employee Payment Day
-- ===================================================

-- Day of month (1–31) on which the employee is expected to receive their salary.
-- Used for dashboard alerts when the payment date is approaching/overdue.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS payment_day integer CHECK (payment_day BETWEEN 1 AND 31);
