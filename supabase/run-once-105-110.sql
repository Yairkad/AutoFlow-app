-- Run once in the Supabase SQL editor: every migration of this release (105–110) together.
-- Each part is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), so running it twice is safe.

-- ═══════════════ 105_supplier_invoice_items.sql ═══════════════
-- "📦 מה הגיע?" — the goods that arrived with a supplier invoice. Saving them adds the stock
-- (tires / products), so an invoice can be received without scanning.
CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  debt_id      UUID NOT NULL REFERENCES supplier_debts(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL CHECK (item_type IN ('tire','product')),
  ref_id       UUID,              -- tires.id / products.id (no FK: either table)
  description  TEXT NOT NULL,     -- as shown on the invoice, e.g. "מישלן 205/55R16"
  qty          INTEGER NOT NULL CHECK (qty > 0),
  unit_cost    NUMERIC(10,2),     -- price on the invoice — becomes the item's cost price
  movement_id  UUID,              -- tire_sales / product_sales 'order' row, removed if the line is deleted
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_debt ON supplier_invoice_items(debt_id);

ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_invoice_items_tenant" ON supplier_invoice_items;
CREATE POLICY "supplier_invoice_items_tenant" ON supplier_invoice_items
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ═══════════════ 106_tire_brands.sql ═══════════════
-- Hebrew names for tire brands, set once per brand (Michelin = מישלן) and applied to every tire
-- of that brand: search works in both languages, screens show Hebrew with the English under it.
CREATE TABLE IF NOT EXISTS tire_brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name_en     TEXT NOT NULL,   -- as written on the tires (tires.brand)
  name_he     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tire_brands_tenant_name ON tire_brands(tenant_id, lower(name_en));

ALTER TABLE tire_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tire_brands_tenant" ON tire_brands;
CREATE POLICY "tire_brands_tenant" ON tire_brands
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ═══════════════ 107_task_updates.sql ═══════════════
-- Tasks (the old reminders + tasks merged into one list): progress updates on a task.
-- A task is a row in `reminders`; its status is reminders.status ('open' | 'in_progress' | 'closed'),
-- is_done mirrors status = 'closed' so older screens keep working.
CREATE TABLE IF NOT EXISTS reminder_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_id  UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  author       TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_updates_reminder ON reminder_updates(reminder_id, created_at);

ALTER TABLE reminder_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminder_updates_tenant" ON reminder_updates;
CREATE POLICY "reminder_updates_tenant" ON reminder_updates
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Reminders that were marked done now read as closed tasks
UPDATE reminders SET status = 'closed' WHERE is_done = true AND COALESCE(status, 'open') <> 'closed';

-- ═══════════════ 108_request_no_answer.sql ═══════════════
-- Yard customer requests: "we called, no answer" marker, independent of the request status
alter table customer_requests add column if not exists no_answer_count int not null default 0;
alter table customer_requests add column if not exists no_answer_at timestamptz;

-- ═══════════════ 109_stock_movement_source.sql ═══════════════
-- Stock movements: where each line came from, so the stock screen can show yard sales, invoice
-- arrivals and manual corrections side by side.
alter table tire_sales    add column if not exists source text;          -- yard | manual | invoice | receive
alter table tire_sales    add column if not exists session_id uuid;      -- yard work card that sold it
alter table tire_sales    add column if not exists note text;
alter table product_sales add column if not exists source text;
alter table product_sales add column if not exists session_id uuid;
alter table product_sales add column if not exists note text;

-- ═══════════════ 110_alt_barcodes.sql ═══════════════
-- One item, several barcodes: some makers print a different code on the same tire, so a tire
-- (or product) keeps extra barcodes besides its main sku/barcode. Scans match any of them.
alter table tires    add column if not exists alt_barcodes text[] not null default '{}';
alter table products add column if not exists alt_barcodes text[] not null default '{}';
create index if not exists idx_tires_alt_barcodes    on tires    using gin (alt_barcodes);
create index if not exists idx_products_alt_barcodes on products using gin (alt_barcodes);
