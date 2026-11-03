-- Purchase inspection: the vehicle's license fee group (קבוצת רישוי / kvuzat_agra_cd, 1-7).
-- Filled automatically from the data.gov.il models registry by plate, editable by hand.
-- The inspection price is set per group (price_list rows of the inspection category).
alter table car_inspections add column if not exists fee_group smallint;
