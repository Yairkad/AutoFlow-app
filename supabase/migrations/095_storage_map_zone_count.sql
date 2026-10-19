-- ════════════════════════════════════════════
-- AutoFlow – Migration 095: Storage map + inventory count by zone
--   • storage_maps — the cabinets/shelves map (one JSON layout per tenant).
--     RLS on with no policies: read/written only through /api/yard/storage-map (service role).
--   • tire_inventory_count_sessions.zone — shelves covered by a zone count (NULL = full count)
--   • tire_inventory_count_sessions.counted_by_name — who counted (yard employee / office user)
--   • tire_inventory_count_entries.location — where the tire was found
-- Safe to run more than once.
-- ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS storage_maps (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  layout      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE storage_maps ENABLE ROW LEVEL SECURITY;

ALTER TABLE tire_inventory_count_sessions
  ADD COLUMN IF NOT EXISTS zone            TEXT[],
  ADD COLUMN IF NOT EXISTS counted_by_name TEXT;

ALTER TABLE tire_inventory_count_entries
  ADD COLUMN IF NOT EXISTS location TEXT;
