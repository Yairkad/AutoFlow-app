-- ══════════════════════════════════════════════════════════════════════════
-- 033 · registration_tokens – admin RLS + default_modules column
-- ══════════════════════════════════════════════════════════════════════════

-- Store which modules the invited employee should receive
ALTER TABLE registration_tokens ADD COLUMN IF NOT EXISTS default_modules text[] DEFAULT '{}';

-- Admin can insert tokens for their own tenant
CREATE POLICY "token_admin_insert" ON registration_tokens
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Admin can see ALL tokens for their tenant (including used/expired)
CREATE POLICY "token_admin_select" ON registration_tokens
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Admin can delete tokens for their tenant
CREATE POLICY "token_admin_delete" ON registration_tokens
  FOR DELETE USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
