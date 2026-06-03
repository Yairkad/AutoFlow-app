-- Add barcode field to products (separate from sku/מק"ט)
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text;
