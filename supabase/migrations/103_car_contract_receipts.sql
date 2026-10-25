-- AutoFlow – Migration 103: track the buyer's payments of a signed car sale contract.
-- receipts = { "<payment key>": { status, at, note, by } } — one entry per cash / transfer line or check
-- that was handled (received / cleared / swapped for cash / bounced). Kept apart from `data` so the
-- contract editor never overwrites it. Safe to run more than once.
ALTER TABLE car_sale_contracts
  ADD COLUMN IF NOT EXISTS receipts jsonb NOT NULL DEFAULT '{}'::jsonb;
