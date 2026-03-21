-- Google Drive integration per tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS drive_refresh_token text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS drive_root_folder_id text;
