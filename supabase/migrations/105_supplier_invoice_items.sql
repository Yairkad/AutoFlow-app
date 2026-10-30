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
