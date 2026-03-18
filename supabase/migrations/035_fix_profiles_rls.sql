-- ══════════════════════════════════════════════════════════════════════════
-- 035 · Fix recursive RLS on profiles
-- ══════════════════════════════════════════════════════════════════════════
-- The original profiles_same_tenant policy does a subquery on profiles
-- from within a profiles RLS policy → recursive, returns empty for multi-row
-- queries. Fix: use a SECURITY DEFINER function that bypasses RLS.

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;

-- Replace the recursive policy
DROP POLICY IF EXISTS "profiles_same_tenant" ON profiles;

CREATE POLICY "profiles_same_tenant" ON profiles
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
  );
