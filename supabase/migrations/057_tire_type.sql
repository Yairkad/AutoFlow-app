-- AutoFlow – Migration 057: Add tire_type to tires + current_location to cars

-- סוג צמיג: regular | reinforced | commercial
ALTER TABLE tires
  ADD COLUMN IF NOT EXISTS tire_type TEXT NOT NULL DEFAULT 'regular';

-- מיקום נוכחי / מי נוהג ברכב
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS current_location TEXT;
