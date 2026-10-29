-- One item, several barcodes: some makers print a different code on the same tire, so a tire
-- (or product) keeps extra barcodes besides its main sku/barcode. Scans match any of them.
alter table tires    add column if not exists alt_barcodes text[] not null default '{}';
alter table products add column if not exists alt_barcodes text[] not null default '{}';
create index if not exists idx_tires_alt_barcodes    on tires    using gin (alt_barcodes);
create index if not exists idx_products_alt_barcodes on products using gin (alt_barcodes);
