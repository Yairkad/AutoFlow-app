-- AutoFlow – Migration 058: Tire Inventory Count Sessions

-- סשן ספירת מלאי — כל ספירה היא סשן עם תאריך והערות
CREATE TABLE IF NOT EXISTS tire_inventory_count_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  is_first    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ערכי ספירה — צמיג + כמות שנספרה + כמות צפויה + כמות במערכת
CREATE TABLE IF NOT EXISTS tire_inventory_count_entries (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID    NOT NULL REFERENCES tire_inventory_count_sessions(id) ON DELETE CASCADE,
  tire_id      UUID    REFERENCES tires(id) ON DELETE SET NULL,
  sku          TEXT,
  label        TEXT,
  counted_qty  INTEGER NOT NULL,
  expected_qty INTEGER,     -- מה היינו מצפים לפי ספירה קודמת + תנועות
  system_qty   INTEGER      -- מה היה במערכת בזמן הספירה
);

-- RLS
ALTER TABLE tire_inventory_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tire_inventory_count_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_count_sessions" ON tire_inventory_count_sessions
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_count_entries" ON tire_inventory_count_entries
  USING (
    session_id IN (
      SELECT id FROM tire_inventory_count_sessions
      WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    )
  );
