-- Optional multi-month period for irregular meter readings, and an optional
-- fixed add-on charge that rides on top of a meter-based bill (e.g. the electric
-- company's fixed infrastructure fee, on top of kWh usage) — stays on the payer's
-- side only, never passed on to the sub-tenant.
-- (VAT itself needed no schema change — the existing before/after toggle just
-- wasn't wired into the saved amount; fixed in application code.)
ALTER TABLE billing_items
  ADD COLUMN IF NOT EXISTS fixed_addon numeric(10,2);

ALTER TABLE billing_entries
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS fixed_addon numeric(10,2);
