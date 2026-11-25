-- Payment terms per supplier / customer: "שוטף + N" days. The expected payment date of an
-- invoice = end of the invoice's month + N days. Used by the Amir cash-flow export.
alter table suppliers add column if not exists payment_terms_days integer not null default 30;
alter table customers add column if not exists payment_terms_days integer not null default 30;
