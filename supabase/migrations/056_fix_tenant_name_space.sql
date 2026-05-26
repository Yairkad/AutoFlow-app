-- Fix tenant name: replace 'אוטוליין' (no space) with 'אוטו ליין' (with space)
UPDATE tenants
SET name = 'אוטו ליין'
WHERE name = 'אוטוליין';
