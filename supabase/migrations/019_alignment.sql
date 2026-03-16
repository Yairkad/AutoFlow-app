-- Phase 12: Alignment jobs (פרונט / כיוון צירים)

CREATE TABLE alignment_jobs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Vehicle
  plate       text        NOT NULL,
  make        text,
  model       text,
  year        int,
  color       text,

  -- Customer
  customer_name  text     NOT NULL,
  customer_phone text,

  -- Job
  job_type    text        NOT NULL DEFAULT 'alignment', -- alignment | balancing | alignment+balancing | other
  notes       text,
  technician  text,
  price       numeric,

  -- Kanban status
  status      text        NOT NULL DEFAULT 'waiting', -- waiting | in_progress | done | delivered

  -- Customer tracking (public token, no auth)
  track_token text        UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE alignment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_alignment" ON alignment_jobs
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Public read policy: anyone with the token can view limited fields (for /track page)
CREATE POLICY "public_track_read" ON alignment_jobs
  FOR SELECT
  USING (track_token IS NOT NULL);

-- Index for fast tenant lookup
CREATE INDEX idx_alignment_tenant ON alignment_jobs(tenant_id);

-- Index for public track lookup (no auth)
CREATE INDEX idx_alignment_token ON alignment_jobs(track_token);
