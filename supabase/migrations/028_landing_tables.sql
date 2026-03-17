-- ══════════════════════════════════════════════════════════════════════════
-- 028 · Landing Page Tables
-- services, promotions, price_list
-- ══════════════════════════════════════════════════════════════════════════

-- ── services ──────────────────────────────────────────────────────────────
create table if not exists services (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  description text,
  icon        text,           -- emoji or icon name
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table services enable row level security;

create policy "tenant read services"  on services for select using (tenant_id = (select tenant_id from profiles where id = auth.uid()));
create policy "tenant write services" on services for all    using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- Public read (no auth) – landing page reads from this table
create policy "public read services"  on services for select using (is_active = true);

create index if not exists services_tenant_idx on services(tenant_id, sort_order);

-- ── promotions ────────────────────────────────────────────────────────────
create table if not exists promotions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  description text,
  image_url   text,
  link_url    text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now()
);

alter table promotions enable row level security;

create policy "tenant read promotions"  on promotions for select using (tenant_id = (select tenant_id from profiles where id = auth.uid()));
create policy "tenant write promotions" on promotions for all    using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- Public read – only active, within date range
create policy "public read promotions"  on promotions for select using (
  is_active = true
  and (start_date is null or start_date <= current_date)
  and (end_date   is null or end_date   >= current_date)
);

create index if not exists promotions_tenant_idx on promotions(tenant_id, sort_order);

-- ── price_list ────────────────────────────────────────────────────────────
create table if not exists price_list (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  category    text not null,   -- e.g. 'כיוון פרונט', 'בדיקת קניה'
  service_name text not null,
  price       numeric(10,2),
  price_note  text,            -- e.g. 'החל מ-', 'לפי רכב', 'חינם'
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table price_list enable row level security;

create policy "tenant read price_list"  on price_list for select using (tenant_id = (select tenant_id from profiles where id = auth.uid()));
create policy "tenant write price_list" on price_list for all    using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

create policy "public read price_list"  on price_list for select using (is_active = true);

create index if not exists price_list_tenant_idx on price_list(tenant_id, category, sort_order);
