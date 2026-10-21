-- AutoFlow – Migration 102: waiting-customer requests get an optional install appointment
-- (set after a call with the customer). Safe to run more than once.
ALTER TABLE customer_requests
  ADD COLUMN IF NOT EXISTS install_at timestamptz;
