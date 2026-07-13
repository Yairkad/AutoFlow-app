-- Customers master table for the customer ledger (כרטסת לקוחות) feature.
-- Deliberately NOT populated from the old ad-hoc customer_debts table —
-- this is a curated set of credit (הקפה) customers, added manually via
-- a dedicated management page, mirroring suppliers/SuppliersClient.tsx.
CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        text,
  phone           text,
  email           text,
  address         text,
  notes           text,
  opening_balance numeric(10,2) NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_tenant_isolation" ON customers
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Per-tenant customer categories, mirrors supplier_categories (041)
CREATE TABLE customer_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  UNIQUE(tenant_id, name)
);

ALTER TABLE customer_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_categories_tenant_isolation" ON customer_categories
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
