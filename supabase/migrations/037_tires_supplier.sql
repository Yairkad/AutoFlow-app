-- Add supplier reference to tires
ALTER TABLE tires ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
