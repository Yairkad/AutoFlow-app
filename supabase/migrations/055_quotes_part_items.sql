ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS part_items jsonb DEFAULT '[]';
