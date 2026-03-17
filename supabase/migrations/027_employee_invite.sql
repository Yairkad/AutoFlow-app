-- Add employee invite support to registration_tokens
ALTER TABLE registration_tokens
  ADD COLUMN IF NOT EXISTS email     text,
  ADD COLUMN IF NOT EXISTS type      text NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
