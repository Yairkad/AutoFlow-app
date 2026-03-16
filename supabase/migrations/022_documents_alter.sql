-- Phase 16: Documents – add icon field, keep content jsonb for all template data
-- content stores: { icon, columns:[{label,width}], showBusinessName, showDate, headerExtra, footerText }
-- type values: 'form_template' | 'checklist'

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS icon text DEFAULT '📋';

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_type   ON documents(tenant_id, type);
