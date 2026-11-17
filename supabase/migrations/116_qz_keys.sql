-- QZ Tray signing key per business (Documents → מדבקות). The certificate is public (QZ Tray
-- trusts it via override.crt on the office PC); the private key signs every print request so QZ
-- Tray stops asking "allow this site". Server-only: RLS on and NO policies — only the service
-- role (app/api/qz/*) can read it.
create table if not exists qz_keys (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  certificate text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);
alter table qz_keys enable row level security;
