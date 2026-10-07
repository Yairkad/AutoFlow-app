-- Purchase-inspection pre-fill ("טופס מילוי מראש"): the office sends the customer a personal
-- link, the customer fills their details + vehicle + uploads documents, and the row waits in the
-- inspections screen until the customer physically arrives.
--
-- intake_status:
--   NULL        – regular inspection entered in the office (all existing rows)
--   'link_sent' – link created, customer hasn't submitted yet
--   'submitted' – customer submitted the form, waiting for arrival
--   'arrived'   – customer arrived; row is now a regular inspection (kept for the documents)

ALTER TABLE car_inspections
  ADD COLUMN IF NOT EXISTS intake_status       text,
  ADD COLUMN IF NOT EXISTS intake_token        text UNIQUE,
  ADD COLUMN IF NOT EXISTS intake_files        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS intake_submitted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inspections_intake_token ON car_inspections(intake_token);

-- Private bucket for the uploaded documents (ID cards, vehicle license).
-- No storage RLS policies: only the service role (server API routes) reads/writes it, and the
-- office gets short-lived signed URLs after a tenant check.
INSERT INTO storage.buckets (id, name, public)
VALUES ('inspection-intake', 'inspection-intake', false)
ON CONFLICT (id) DO NOTHING;
