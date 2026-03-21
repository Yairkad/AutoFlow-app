-- Add category field to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category text;
