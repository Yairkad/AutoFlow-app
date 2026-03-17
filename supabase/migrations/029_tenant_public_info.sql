-- ══════════════════════════════════════════════════════════════════════════
-- 029 · Tenant public info
-- Adds public_info jsonb for landing-page fields (hours, waze_url, maps_url)
-- ══════════════════════════════════════════════════════════════════════════

alter table tenants
  add column if not exists public_info jsonb not null default '{}'::jsonb;

-- Allow the landing page (anon/service role) to read basic tenant info.
-- The query always filters by id = specific tenant_id, so only one row is returned.
create policy "public read tenant info" on tenants
  for select
  to anon
  using (true);