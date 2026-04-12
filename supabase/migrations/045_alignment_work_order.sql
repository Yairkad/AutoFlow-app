-- 045 · Alignment work order fields
-- Adds external_supplier + auto work_order_number to alignment_jobs

-- Sequential work order numbers (global, unique)
CREATE SEQUENCE IF NOT EXISTS alignment_work_order_seq START 1;

ALTER TABLE alignment_jobs
  ADD COLUMN IF NOT EXISTS external_supplier  text,
  ADD COLUMN IF NOT EXISTS work_order_number  bigint;

-- Number any existing rows
UPDATE alignment_jobs
SET work_order_number = nextval('alignment_work_order_seq')
WHERE work_order_number IS NULL;

-- Default for new rows
ALTER TABLE alignment_jobs
  ALTER COLUMN work_order_number SET DEFAULT nextval('alignment_work_order_seq');
