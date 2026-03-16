-- Phase 17b: Billing Contacts
-- Add contacts entity to billing module

CREATE TABLE billing_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  role              text NOT NULL DEFAULT 'other',   -- 'landlord'|'tenant'|'supplier'|'authority'|'other'
  default_direction text NOT NULL CHECK (default_direction IN ('expense','income')),
  phone             text,
  notes             text,
  active            boolean DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

-- Link billing_items and billing_entries to a contact
ALTER TABLE billing_items    ADD COLUMN contact_id uuid REFERENCES billing_contacts(id) ON DELETE SET NULL;
ALTER TABLE billing_entries  ADD COLUMN contact_id uuid REFERENCES billing_contacts(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE billing_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_billing_contacts" ON billing_contacts
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
