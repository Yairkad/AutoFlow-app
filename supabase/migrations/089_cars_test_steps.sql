-- ================================================================
-- AutoFlow – Migration 089: Cars annual test = fee paid + test passed
-- Both flags are cleared by the app when test_date is renewed (moved later).
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS test_fee_paid       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_fee_paid_date  date,
  ADD COLUMN IF NOT EXISTS test_passed         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_passed_date    date;
