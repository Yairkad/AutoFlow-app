-- Tasks (the old reminders + tasks merged into one list): progress updates on a task.
-- A task is a row in `reminders`; its status is reminders.status ('open' | 'in_progress' | 'closed'),
-- is_done mirrors status = 'closed' so older screens keep working.
CREATE TABLE IF NOT EXISTS reminder_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_id  UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  author       TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_updates_reminder ON reminder_updates(reminder_id, created_at);

ALTER TABLE reminder_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminder_updates_tenant" ON reminder_updates;
CREATE POLICY "reminder_updates_tenant" ON reminder_updates
  USING      (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Reminders that were marked done now read as closed tasks
UPDATE reminders SET status = 'closed' WHERE is_done = true AND COALESCE(status, 'open') <> 'closed';
