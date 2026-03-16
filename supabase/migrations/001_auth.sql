-- ===================================================
-- AutoFlow – Migration 001: Tenants + Profiles
-- Run this in Supabase SQL Editor
-- ===================================================

-- Tenants (businesses)
CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  sub_title     text,
  phone         text,
  address       text,
  tax_id        text,
  logo_base64   text,
  settings      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now()
);

-- Profiles (linked to Supabase Auth users)
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name       text,
  phone           text,
  role            text DEFAULT 'admin',   -- 'admin' | 'employee'
  allowed_modules text[] DEFAULT '{}'::text[],
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Tenants: user sees only their own tenant
CREATE POLICY "tenant_self" ON tenants
  FOR ALL USING (
    id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Profiles: user sees only profiles in their tenant
CREATE POLICY "profiles_same_tenant" ON profiles
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Allow insert of own profile on registration (before tenant exists)
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());
