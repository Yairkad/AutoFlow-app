-- ================================================================
-- AutoFlow – Migration 088: Cars hand (יד), original ownership, car code
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS hand                smallint,
  ADD COLUMN IF NOT EXISTS original_ownership  text,
  ADD COLUMN IF NOT EXISTS car_code            text;   -- קוד רכב (immobilizer / radio), if the car has one
