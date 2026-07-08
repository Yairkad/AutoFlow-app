-- Opening balance per supplier (debt carried over from before tracking began in the app),
-- used as the starting point of the running-balance column on the printed supplier ledger.
alter table suppliers
  add column if not exists opening_balance numeric(10,2) not null default 0;
