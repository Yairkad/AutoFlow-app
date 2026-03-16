-- Phase 15: Reminders & Tasks – add type, status, phone, due_time

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS type     text DEFAULT 'reminder',  -- 'reminder' | 'task'
  ADD COLUMN IF NOT EXISTS status   text DEFAULT 'open',      -- tasks: 'open' | 'in_progress' | 'closed'
  ADD COLUMN IF NOT EXISTS phone    text,                     -- tasks: optional contact phone
  ADD COLUMN IF NOT EXISTS due_time text;                     -- reminders: optional HH:MM
