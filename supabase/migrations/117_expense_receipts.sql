-- Expenses: link to the scanned receipt / tax invoice saved in Drive (קבלות/<year>/<month>).
alter table expenses add column if not exists receipt_file_id text;
alter table expenses add column if not exists receipt_name    text;
alter table expenses add column if not exists receipt_url     text;
notify pgrst, 'reload schema';
