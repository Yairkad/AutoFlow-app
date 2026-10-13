-- ================================================================
-- AutoFlow – Migration 087: refund request for a deposited license
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS deposit_refund_requested       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_refund_requested_date  date;
