-- Migration 047: add track_token to test_transfers for public status tracking

ALTER TABLE test_transfers
  ADD COLUMN IF NOT EXISTS track_token text
    UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex');

-- Public read policy (no auth) – for customer-facing status page
CREATE POLICY "public_track_read_test_transfers"
  ON test_transfers FOR SELECT
  USING (track_token IS NOT NULL);

-- Fast index for public token lookup
CREATE INDEX IF NOT EXISTS idx_test_transfers_token ON test_transfers(track_token);
