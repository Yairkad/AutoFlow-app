-- Signatures and stamps (Settings → חתימות וחותמות) stamped onto the "PDF חתום" of the inspection
-- findings report. Images are transparent PNG data URLs (background removed client-side).
-- A separate table — NOT a tenants column — because ProfileContext loads tenants.* on every page.
create table if not exists signature_stamps (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  kind        text not null check (kind in ('stamp', 'signature')),
  name        text not null default '',
  image       text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists signature_stamps_tenant_idx on signature_stamps(tenant_id);
alter table signature_stamps enable row level security;
drop policy if exists "signature_stamps_tenant_isolation" on signature_stamps;
create policy "signature_stamps_tenant_isolation" on signature_stamps
  for all using (tenant_id = (select tenant_id from profiles where id = auth.uid()));
notify pgrst, 'reload schema';
