-- Migration 046: test_transfers
-- טבלת שינוע לטסטים – לניהול שינוע רכבים לבדיקת רישוי

create table if not exists test_transfers (
  id              uuid        default gen_random_uuid() primary key,
  tenant_id       uuid        references tenants(id) not null,
  plate           text        not null,
  make            text,
  model           text,
  year            int,
  customer_name   text        not null,
  customer_phone  text        not null,
  transfer_date   date,
  notes           text,
  status          text        not null default 'ממתין'
                              check (status in ('ממתין','בדרך','בטסט','עבר','נכשל','הושלם')),
  extra_charges   jsonb       not null default '[]'::jsonb,
  created_at      timestamptz default now()
);

-- RLS
alter table test_transfers enable row level security;

create policy "tenant_read_test_transfers"
  on test_transfers for select
  using (
    tenant_id = (
      select tenant_id from profiles where id = auth.uid()
    )
  );

create policy "tenant_insert_test_transfers"
  on test_transfers for insert
  with check (
    tenant_id = (
      select tenant_id from profiles where id = auth.uid()
    )
  );

create policy "tenant_update_test_transfers"
  on test_transfers for update
  using (
    tenant_id = (
      select tenant_id from profiles where id = auth.uid()
    )
  );

create policy "tenant_delete_test_transfers"
  on test_transfers for delete
  using (
    tenant_id = (
      select tenant_id from profiles where id = auth.uid()
    )
  );

-- index for fast tenant queries
create index if not exists test_transfers_tenant_idx on test_transfers (tenant_id, created_at desc);
