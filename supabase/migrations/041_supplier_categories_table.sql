-- Supplier categories table (per-tenant, dynamic)
create table if not exists supplier_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  unique(tenant_id, name)
);

alter table supplier_categories enable row level security;

create policy "tenant_read"  on supplier_categories for select using (tenant_id = get_my_tenant_id());
create policy "tenant_write" on supplier_categories for all    using (tenant_id = get_my_tenant_id());

-- Seed defaults for all existing tenants
insert into supplier_categories (tenant_id, name)
select id, unnest(array['חלפים','צמיגים','אחר'])
from tenants
on conflict do nothing;
