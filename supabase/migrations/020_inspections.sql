-- Phase 13: Car purchase inspections (בדיקות קניה)

CREATE TABLE car_inspections (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Vehicle (from plate API + manual)
  plate       text        NOT NULL,
  make        text,
  model       text,
  year        int,
  color       text,
  fuel        text,
  engine_cc   int,
  chassis     text,
  seats       int,
  test_date   text,
  km          text,
  ownership_type text,

  -- Owner / Customer
  owner_name  text        NOT NULL,
  owner_id    text,
  owner_phone text,
  owner_address text,

  -- Inspection
  date        text,       -- DD/MM/YYYY
  inspector   text,
  findings    text,
  status      text        NOT NULL DEFAULT 'draft', -- draft | completed

  -- Customer tracking token (not used for now, reserved)
  track_token text        UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE car_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_inspections" ON car_inspections
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_inspections_tenant ON car_inspections(tenant_id);
CREATE INDEX idx_inspections_token  ON car_inspections(track_token);
