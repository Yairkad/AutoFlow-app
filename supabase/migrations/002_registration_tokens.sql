-- ===================================================
-- AutoFlow – Migration 002: Registration Tokens
-- ===================================================

CREATE TABLE registration_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token      text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  used       boolean DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz DEFAULT now()
);

-- No RLS needed – only accessed via service role (server-side)
-- Public can only read to validate (anon can check if token is valid)
ALTER TABLE registration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_read_valid" ON registration_tokens
  FOR SELECT USING (used = false AND expires_at > now());
