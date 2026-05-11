-- ================================================================
-- AutoFlow – Migration 051: Add condition column to tires
-- ================================================================

ALTER TABLE tires
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'new'
    CHECK (condition IN ('new', 'used'));
