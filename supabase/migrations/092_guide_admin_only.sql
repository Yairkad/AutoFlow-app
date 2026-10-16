-- Only admins may change the public tire guide (content or its public link).
-- The tenants RLS policy lets every user of the business update its row, so this is enforced
-- with a trigger. Service-role calls (auth.uid() is null, e.g. /api/guide/public-link which
-- checks the role itself) are allowed.
CREATE OR REPLACE FUNCTION guard_guide_admin_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.guide_content IS DISTINCT FROM OLD.guide_content
      OR NEW.guide_public_token IS DISTINCT FROM OLD.guide_public_token)
     AND NOT EXISTS (
       SELECT 1 FROM profiles
       WHERE id = auth.uid() AND (role = 'super_admin' OR (role = 'admin' AND tenant_id = NEW.id))
     ) THEN
    RAISE EXCEPTION 'רק מנהל יכול לערוך את מדריך הצמיגים' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_guide_admin_only ON tenants;
CREATE TRIGGER tenants_guide_admin_only
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION guard_guide_admin_only();
