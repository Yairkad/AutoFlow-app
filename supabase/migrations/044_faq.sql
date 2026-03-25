create table if not exists faq (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  question    text not null,
  answer      text not null,
  image_url   text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists faq_tenant_idx on faq(tenant_id);

alter table faq enable row level security;

-- tenants can manage their own FAQs
create policy "tenant_manage_faq" on faq
  for all using (
    tenant_id = (select tenant_id from profiles where id = auth.uid())
  );

-- public can read active FAQs
create policy "public_read_faq" on faq
  for select using (is_active = true);
