-- ================================================================
-- AutoFlow – Migration 090: car document names + last test date from the
-- Ministry of Transport registry (data.gov.il)
-- ================================================================

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS doc_names           text[] NOT NULL DEFAULT '{}',  -- names of the car's Drive documents (shown on the card)
  ADD COLUMN IF NOT EXISTS gov_last_test_date  date;                          -- mivchan_acharon_dt from data.gov.il
