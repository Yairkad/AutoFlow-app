-- Add invoice/karteset support to supplier_debts
ALTER TABLE supplier_debts
  ADD COLUMN IF NOT EXISTS doc_type  text    DEFAULT 'invoice',   -- 'invoice' | 'karteset'
  ADD COLUMN IF NOT EXISTS doc_number text,
  ADD COLUMN IF NOT EXISTS invoices  jsonb   DEFAULT '[]'::jsonb; -- [{type, number, amount, description}]
