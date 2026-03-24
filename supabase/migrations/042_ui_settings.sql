-- ui_settings: stores per-tenant UI preferences (sidebar layout, dashboard layout)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ui_settings jsonb DEFAULT '{}'::jsonb;
