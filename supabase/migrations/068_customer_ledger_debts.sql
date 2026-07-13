-- Customer ledger debts — mirrors supplier_debts, but direction is inverted
-- in meaning: 'charge' means the CUSTOMER owes the business more (an
-- invoice/sale on credit), 'credit' reduces what the customer owes (a
-- credit note/refund). The bal() formula itself is unchanged from the
-- supplier version — only the human meaning of "who owes whom" flips.
CREATE TABLE customer_ledger_debts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  amount      numeric(10,2) NOT NULL,
  paid        numeric(10,2) DEFAULT 0,
  description text,
  date        date NOT NULL,
  is_closed   boolean DEFAULT false,
  doc_type    text DEFAULT 'invoice',   -- 'invoice' | 'karteset'
  doc_number  text,
  invoices    jsonb DEFAULT '[]'::jsonb,
  direction   text NOT NULL DEFAULT 'charge' CHECK (direction IN ('charge', 'credit')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE customer_ledger_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_ledger_debts_tenant_isolation" ON customer_ledger_debts
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
