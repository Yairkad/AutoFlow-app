-- Per-customer "actions" catalog (e.g. "פרונט", "צמיגים") with an optional fixed price,
-- used to quick-fill the "מעקב" tab's per-visit note + amount for repeat customers instead
-- of retyping the same combination every time. Plus a per-visit vehicle plate on
-- customer_ledger_debts (not on customers — the same customer can arrive with a different
-- vehicle across visits), looked up against the government registry (lib/utils/plateApi.ts)
-- to auto-append make/model/year into that visit's note.

CREATE TABLE customer_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          text NOT NULL,
  default_price numeric(10,2),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE customer_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_actions_tenant_isolation" ON customer_actions
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

ALTER TABLE customer_ledger_debts ADD COLUMN plate text;
