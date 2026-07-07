-- Lets the user dismiss the "unlinked check" warning for checks that are
-- intentionally not tied to any specific supplier debt (e.g. an advance).
alter table scheduled_payments
  add column if not exists allocation_ignored boolean not null default false;
