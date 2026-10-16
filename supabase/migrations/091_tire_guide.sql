-- Public tire & wheel guide (customers scan a QR at the garage).
-- guide_public_token: random token in the public URL /guide/<token> (never the tenant id).
-- guide_content: the garage's edited content (null = built-in default from lib/guide/content.ts).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS guide_public_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS guide_content      jsonb;
