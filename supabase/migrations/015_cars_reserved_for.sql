-- ================================================================
-- AutoFlow – Migration 015: Cars reserved_for field
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS reserved_for text;
