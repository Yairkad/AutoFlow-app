CREATE SEQUENCE IF NOT EXISTS car_inspections_num_seq START WITH 1000;
ALTER TABLE car_inspections
  ADD COLUMN IF NOT EXISTS inspection_number integer NOT NULL DEFAULT nextval('car_inspections_num_seq');
