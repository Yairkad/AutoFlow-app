-- ================================================================
-- AutoFlow – Migration 088: Cars hand (יד) + original ownership
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS hand                smallint,
  ADD COLUMN IF NOT EXISTS original_ownership  text;
