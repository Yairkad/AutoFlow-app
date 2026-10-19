-- Backup tracking: when the tenant last got a successful backup (manual download, manual
-- "back up to Drive now", or the daily automatic Drive backup) and the last automatic failure.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS last_backup_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_backup_kind  text,
  ADD COLUMN IF NOT EXISTS last_backup_error text;
