-- Stock movements: where each line came from, so the stock screen can show yard sales, invoice
-- arrivals and manual corrections side by side.
alter table tire_sales    add column if not exists source text;          -- yard | manual | invoice | receive
alter table tire_sales    add column if not exists session_id uuid;      -- yard work card that sold it
alter table tire_sales    add column if not exists note text;
alter table product_sales add column if not exists source text;
alter table product_sales add column if not exists session_id uuid;
alter table product_sales add column if not exists note text;
