-- Phase 15: Reminders – add category & notes fields

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS notes    text;
