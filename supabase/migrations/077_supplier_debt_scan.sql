-- Attach scanned invoice files (Google Drive) to supplier debts
ALTER TABLE supplier_debts
  ADD COLUMN IF NOT EXISTS drive_file_id   text,
  ADD COLUMN IF NOT EXISTS drive_file_name text,
  ADD COLUMN IF NOT EXISTS drive_file_url  text;
