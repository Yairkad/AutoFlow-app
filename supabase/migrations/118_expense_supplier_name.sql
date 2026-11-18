-- Expenses: free-text supplier name for one-off purchases from a supplier that isn't in the
-- suppliers list (the user chose not to add it). supplier_id stays the link for listed suppliers.
alter table expenses add column if not exists supplier_name text;
notify pgrst, 'reload schema';
