-- Add car_code field to car_inspections (internal reference code)
ALTER TABLE car_inspections ADD COLUMN IF NOT EXISTS car_code text;
