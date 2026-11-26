-- One charge per fixed recurring item per month: supplier charges are now created automatically
-- at the start of each month (lib/debts/autoSupplierRecurringCharges.ts), from more than one place.
-- Meter readings (meter_curr set) may legitimately repeat within a month and are excluded.
-- Skipped (with a notice) if duplicates already exist — clean them up, then run again.
do $$
begin
  if exists (
    select 1 from supplier_debts
    where recurring_item_id is not null and direction = 'charge' and meter_curr is null
    group by recurring_item_id, date_trunc('month', date::timestamp) having count(*) > 1
  ) then
    raise notice 'duplicate monthly recurring charges exist — index not created';
  else
    create unique index if not exists supplier_debts_recurring_month_uq
      on supplier_debts (recurring_item_id, date_trunc('month', date::timestamp))
      where recurring_item_id is not null and direction = 'charge' and meter_curr is null;
  end if;
end $$;
