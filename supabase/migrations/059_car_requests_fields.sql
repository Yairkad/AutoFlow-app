-- Add transmission and max_hand to car_requests
ALTER TABLE car_requests ADD COLUMN IF NOT EXISTS transmission text;
ALTER TABLE car_requests ADD COLUMN IF NOT EXISTS max_hand integer;
