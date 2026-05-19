-- Add tire position tracking to yard session items
ALTER TABLE yard_session_items
  ADD COLUMN IF NOT EXISTS tire_position TEXT
    CHECK (tire_position IN ('FL','FR','RL','RR'));
