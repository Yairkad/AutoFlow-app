-- Contacts page: the person to talk to at a ledger customer (suppliers already have contact_name)
alter table customers add column if not exists contact_name text;
