-- ══════════════════════════════════════════════════════════════════════════
-- 031 · Services – add image_url column
-- ══════════════════════════════════════════════════════════════════════════

alter table services add column if not exists image_url text;
