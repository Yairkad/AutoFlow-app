-- ===================================================
-- AutoFlow – Migration 003: All Module Tables
-- ===================================================

-- EXPENSES
CREATE TABLE expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date        date NOT NULL,
  category    text,
  description text,
  amount      numeric(10,2) NOT NULL,
  supplier_id uuid,
  created_at  timestamptz DEFAULT now()
);

-- INCOME
CREATE TABLE income (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date        date NOT NULL,
  category    text,
  description text,
  amount      numeric(10,2) NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- SUPPLIERS
CREATE TABLE suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  contact_name text,
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

-- CUSTOMER DEBTS
CREATE TABLE customer_debts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  plate       text,
  amount      numeric(10,2) NOT NULL,
  paid        numeric(10,2) DEFAULT 0,
  description text,
  date        date NOT NULL,
  is_closed   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- SUPPLIER DEBTS
CREATE TABLE supplier_debts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id),
  amount      numeric(10,2) NOT NULL,
  paid        numeric(10,2) DEFAULT 0,
  description text,
  date        date NOT NULL,
  is_closed   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- EMPLOYEES
CREATE TABLE employees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone       text,
  role        text,
  salary_type text DEFAULT 'monthly',  -- 'monthly' | 'hourly'
  base_salary numeric(10,2),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- SALARIES
CREATE TABLE salaries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       text NOT NULL,  -- 'MM/YYYY'
  base        numeric(10,2) DEFAULT 0,
  bonus       numeric(10,2) DEFAULT 0,
  deductions  numeric(10,2) DEFAULT 0,
  total       numeric(10,2) DEFAULT 0,
  is_paid     boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- PRODUCTS (inventory)
CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  sku          text,
  category     text,
  qty          integer DEFAULT 0,
  buy_price    numeric(10,2),
  sell_price   numeric(10,2),
  supplier_id  uuid REFERENCES suppliers(id),
  created_at   timestamptz DEFAULT now()
);

-- TIRES (inventory)
CREATE TABLE tires (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  brand       text,
  width       integer,
  profile     integer,
  diameter    integer,
  season      text,   -- 'summer' | 'winter' | 'all'
  sku         text,
  qty         integer DEFAULT 0,
  buy_price   numeric(10,2),
  sell_price  numeric(10,2),
  created_at  timestamptz DEFAULT now()
);

-- QUOTES
CREATE TABLE quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL,  -- 'tires' | 'parts' | 'cars'
  client_name text,
  phone       text,
  plate       text,
  items       jsonb DEFAULT '[]',
  total       numeric(10,2),
  status      text DEFAULT 'open',  -- 'open' | 'sent' | 'closed'
  created_at  timestamptz DEFAULT now()
);

-- REMINDERS
CREATE TABLE reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  due_date    date,
  priority    text DEFAULT 'medium',  -- 'low' | 'medium' | 'high'
  is_done     boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- ALIGNMENTS (פרונט)
CREATE TABLE alignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate       text NOT NULL,
  client_name text,
  phone       text,
  car_make    text,
  car_model   text,
  car_year    integer,
  status      text DEFAULT 'received',  -- 'received' | 'in_progress' | 'checking' | 'ready'
  notes       text,
  tracking_token uuid DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now()
);

-- PURCHASE INSPECTIONS (בדיקות קניה)
CREATE TABLE inspections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate       text NOT NULL,
  client_name text,
  phone       text,
  car_make    text,
  car_model   text,
  car_year    integer,
  data        jsonb DEFAULT '{}',  -- inspection form data
  drive_url   text,
  created_at  timestamptz DEFAULT now()
);

-- BILLING (חשבונות – חיובים קבועים)
CREATE TABLE billing_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  amount      numeric(10,2),
  due_day     integer,  -- day of month
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- BILLING PAYMENTS
CREATE TABLE billing_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  billing_tenant_id  uuid NOT NULL REFERENCES billing_tenants(id) ON DELETE CASCADE,
  month             text NOT NULL,
  is_paid           boolean DEFAULT false,
  paid_at           timestamptz,
  created_at        timestamptz DEFAULT now()
);

-- DOCUMENTS (טפסים להדפסה)
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text,
  content     jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- CARS INVENTORY
CREATE TABLE cars (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate       text,
  make        text,
  model       text,
  year        integer,
  color       text,
  buy_price   numeric(10,2),
  sell_price  numeric(10,2),
  status      text DEFAULT 'inventory',  -- 'inventory' | 'sold'
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- ===================================================
-- RLS for all tables
-- ===================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'expenses','income','suppliers','customer_debts','supplier_debts',
    'employees','salaries','products','tires','quotes','reminders',
    'alignments','inspections','billing_tenants','billing_payments',
    'documents','cars'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "%s_tenant_isolation" ON %I FOR ALL USING (
        tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
      )', tbl, tbl
    );
  END LOOP;
END $$;
