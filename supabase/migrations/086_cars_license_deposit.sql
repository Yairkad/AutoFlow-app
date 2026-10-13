-- ================================================================
-- AutoFlow – Migration 086: Cars license deposit (הפקדת רישיון)
-- A car taken off the road whose license was deposited at the
-- licensing office — no test/insurance expected while deposited.
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS license_deposited     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS license_deposit_date  date;
