-- ════════════════════════════════════════════
-- AutoFlow – Migration 095: Yard terminal login by employee + PIN
--   • employees.yard_modules — which yard sections the employee sees
--     (NULL = default: every section except money in reports)
--   • yard_pins — hashed PIN per employee + lockout counters.
--     RLS on with NO policies: only the service role (server) can read it,
--     so the hash never reaches a browser.
-- Safe to run more than once.
-- ════════════════════════════════════════════

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS yard_modules TEXT[];

CREATE TABLE IF NOT EXISTS yard_pins (
  employee_id     UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pin_hash        TEXT NOT NULL,          -- scrypt$<salt>$<hash>
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE yard_pins ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_yard_pins_tenant ON yard_pins(tenant_id);
