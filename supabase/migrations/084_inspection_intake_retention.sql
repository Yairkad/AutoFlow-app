-- Privacy for the purchase-inspection pre-fill link:
--   intake_consent_at – when the customer ticked the consent box on the public form
--   intake_arrived_at – when the office marked the customer as arrived; uploaded ID / license
--                       images are deleted 30 days after it (see /api/inspection-intake/purge)
ALTER TABLE car_inspections
  ADD COLUMN IF NOT EXISTS intake_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS intake_arrived_at timestamptz;
