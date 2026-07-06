-- A supplier debt row can be a charge (regular invoice, adds to what's owed)
-- or a credit note (returned goods, discount — reduces what's owed).
ALTER TABLE supplier_debts
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'charge'
    CHECK (direction IN ('charge', 'credit'));
