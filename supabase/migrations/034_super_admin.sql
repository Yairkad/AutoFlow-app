-- ══════════════════════════════════════════════════════════════════════════
-- 034 · super_admin role
-- ══════════════════════════════════════════════════════════════════════════

-- No schema change needed (role column is free-text).
-- Update the first registered user (owner) of each tenant to super_admin.
-- Only affects tenants that currently have exactly the original admin.
-- Run manually per tenant as needed, or update via the UI.

-- Example: promote a specific user to super_admin
-- UPDATE profiles SET role = 'super_admin' WHERE id = '<user-id>';
