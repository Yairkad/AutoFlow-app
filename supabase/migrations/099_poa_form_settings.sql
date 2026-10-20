-- ════════════════════════════════════════════
-- AutoFlow – Migration 099: Power-of-attorney form (ייפוי כוח – משרד התחבורה)
--   • poa_form_settings — per-tenant field calibration + saved owners / proxies for quick fill
-- Filled forms are printed only, never stored.
-- Safe to run more than once.
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS poa_form_settings (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- { fields: { <fieldId>: { x, y, w, h, fs } }, offsetX, offsetY }  (pt / mm)
  layout      JSONB,
  -- [{ id, name, idNum }]
  proxies     JSONB NOT NULL DEFAULT '[]'::jsonb,
  owners      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE poa_form_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poa_form_settings_tenant" ON poa_form_settings;
CREATE POLICY "poa_form_settings_tenant" ON poa_form_settings
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
