-- Phase 18b: Password Vault
-- Secure storage for usernames, passwords, bank codes, credit cards, etc.

CREATE TABLE vault_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'other',  -- 'site'|'bank'|'credit'|'other'
  username    text,
  password    text,
  notes       text,
  url         text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_vault" ON vault_items
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
