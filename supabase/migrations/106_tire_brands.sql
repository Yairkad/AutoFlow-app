-- Hebrew names for tire brands, set once per brand (Michelin = מישלן) and applied to every tire
-- of that brand: search works in both languages, screens show Hebrew with the English under it.
CREATE TABLE IF NOT EXISTS tire_brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name_en     TEXT NOT NULL,   -- as written on the tires (tires.brand)
  name_he     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tire_brands_tenant_name ON tire_brands(tenant_id, lower(name_en));

ALTER TABLE tire_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tire_brands_tenant" ON tire_brands;
CREATE POLICY "tire_brands_tenant" ON tire_brands
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
