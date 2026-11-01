-- Post-dated checks: the date the check was handed to the supplier. The supplier's balance drops
-- on this date (the whole series at once), not on each check's due date. Existing rows: the day
-- they were entered (or the due date, if that is earlier — a check entered after the fact).
alter table scheduled_payments add column if not exists handed_date date;
update scheduled_payments set handed_date = least(created_at::date, due_date)
  where handed_date is null and payment_method = 'check';
