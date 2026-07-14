-- Migrates all historical billing data into the supplier/customer ledgers.
-- Idempotent: every INSERT is guarded by NOT EXISTS keyed on the preserved
-- original UUID, so this is safe to re-run after a partial failure.
--
-- Pre-flight audit (run before this migration, not assumed clean by the SQL
-- itself) found: 0 mixed-direction contacts, 0 contact-less active items,
-- 0 orphaned entries -- the straightforward per-direction split below is safe
-- for this tenant's actual data as of the audit date.

-- 1) billing_contacts -> suppliers (expense) / customers (income), same id.
INSERT INTO suppliers (id, tenant_id, name, phone, notes, category, opening_balance, created_at)
SELECT bc.id, bc.tenant_id, bc.name, bc.phone, bc.notes,
  CASE bc.role
    WHEN 'landlord'  THEN 'משכיר'
    WHEN 'authority' THEN 'רשות / עירייה'
    WHEN 'supplier'  THEN 'ספק'
    ELSE 'אחר'
  END,
  0, bc.created_at
FROM billing_contacts bc
WHERE bc.default_direction = 'expense'
  AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = bc.id);

INSERT INTO customers (id, tenant_id, name, phone, notes, category, opening_balance, created_at)
SELECT bc.id, bc.tenant_id, bc.name, bc.phone, bc.notes,
  CASE bc.role
    WHEN 'tenant' THEN 'שוכר'
    ELSE 'אחר'
  END,
  0, bc.created_at
FROM billing_contacts bc
WHERE bc.default_direction = 'income'
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = bc.id);

-- Seed the derived category strings into the per-tenant picker lists.
INSERT INTO supplier_categories (tenant_id, name)
  SELECT DISTINCT tenant_id, category FROM suppliers WHERE category IS NOT NULL
  ON CONFLICT DO NOTHING;
INSERT INTO customer_categories (tenant_id, name)
  SELECT DISTINCT tenant_id, category FROM customers WHERE category IS NOT NULL
  ON CONFLICT DO NOTHING;

-- 2) billing_items -> recurring_items, same id, contact_id rewired per direction.
--    Contact-less items (contact_id IS NULL) are intentionally skipped -- there
--    were none at audit time, but the guard stays for safety.
INSERT INTO recurring_items (id, tenant_id, name, supplier_id, type, amount, price_per_unit, fixed_addon, valid_from, active, created_at)
SELECT bi.id, bi.tenant_id, bi.name, bi.contact_id, bi.type, bi.amount, bi.price_per_unit, bi.fixed_addon, bi.valid_from, bi.active, bi.created_at
FROM billing_items bi
WHERE bi.direction = 'expense' AND bi.contact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM recurring_items ri WHERE ri.id = bi.id);

INSERT INTO recurring_items (id, tenant_id, name, customer_id, type, amount, price_per_unit, fixed_addon, valid_from, active, created_at)
SELECT bi.id, bi.tenant_id, bi.name, bi.contact_id, bi.type, bi.amount, bi.price_per_unit, bi.fixed_addon, bi.valid_from, bi.active, bi.created_at
FROM billing_items bi
WHERE bi.direction = 'income' AND bi.contact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM recurring_items ri WHERE ri.id = bi.id);

-- 3) billing_entries -> supplier_debts / customer_ledger_debts, same id.
--    recurring_item_id is resolved via a subquery (not a raw column copy) so
--    an entry whose item was skipped in step 2 gets NULL instead of an FK error.
INSERT INTO supplier_debts (
  id, tenant_id, supplier_id, amount, paid, description, date, is_closed,
  doc_type, doc_number, direction, invoices,
  recurring_item_id, meter_prev, meter_curr, price_per_unit, fixed_addon, period_start, period_end, created_at
)
SELECT be.id, be.tenant_id, COALESCE(be.contact_id, bi.contact_id),
  be.amount, COALESCE(bep.paid_sum, 0), be.notes,
  COALESCE(be.period_start, (be.month || '-01')::date),
  COALESCE(bep.paid_sum, 0) >= be.amount,
  'invoice', NULL, 'charge', '[]'::jsonb,
  (SELECT ri.id FROM recurring_items ri WHERE ri.id = be.billing_item_id),
  be.meter_prev, be.meter_curr, be.price_per_unit, be.fixed_addon, be.period_start, be.period_end,
  be.created_at
FROM billing_entries be
LEFT JOIN billing_items bi ON bi.id = be.billing_item_id
LEFT JOIN (SELECT entry_id, SUM(amount) AS paid_sum FROM billing_entry_payments GROUP BY entry_id) bep
  ON bep.entry_id = be.id
WHERE be.direction = 'expense'
  AND NOT EXISTS (SELECT 1 FROM supplier_debts sd WHERE sd.id = be.id);

INSERT INTO customer_ledger_debts (
  id, tenant_id, customer_id, amount, paid, description, date, is_closed,
  doc_type, doc_number, direction, invoices,
  recurring_item_id, meter_prev, meter_curr, price_per_unit, fixed_addon, period_start, period_end, created_at
)
SELECT be.id, be.tenant_id, COALESCE(be.contact_id, bi.contact_id),
  be.amount, COALESCE(bep.paid_sum, 0), be.notes,
  COALESCE(be.period_start, (be.month || '-01')::date),
  COALESCE(bep.paid_sum, 0) >= be.amount,
  'invoice', NULL, 'charge', '[]'::jsonb,
  (SELECT ri.id FROM recurring_items ri WHERE ri.id = be.billing_item_id),
  be.meter_prev, be.meter_curr, be.price_per_unit, be.fixed_addon, be.period_start, be.period_end,
  be.created_at
FROM billing_entries be
LEFT JOIN billing_items bi ON bi.id = be.billing_item_id
LEFT JOIN (SELECT entry_id, SUM(amount) AS paid_sum FROM billing_entry_payments GROUP BY entry_id) bep
  ON bep.entry_id = be.id
WHERE be.direction = 'income'
  AND NOT EXISTS (SELECT 1 FROM customer_ledger_debts cd WHERE cd.id = be.id);

-- 4) billing_entry_payments -> supplier_debt_payments / customer_ledger_payments.
--    supplier_debt_payments has no date column at all -- backdate created_at to
--    the original paid_date so the payment history stays chronologically honest.
INSERT INTO supplier_debt_payments (id, tenant_id, supplier_debt_id, scheduled_payment_id, amount, created_at)
SELECT bep.id, bep.tenant_id, bep.entry_id, NULL, bep.amount, bep.paid_date::timestamptz
FROM billing_entry_payments bep
JOIN billing_entries be ON be.id = bep.entry_id
WHERE be.direction = 'expense'
  AND NOT EXISTS (SELECT 1 FROM supplier_debt_payments p WHERE p.id = bep.id);

INSERT INTO customer_ledger_payments (id, tenant_id, customer_ledger_debt_id, amount, payment_method, notes, payment_date, receipt_issued, created_at)
SELECT bep.id, bep.tenant_id, bep.entry_id, bep.amount, 'מזומן', bep.notes, bep.paid_date, false, bep.paid_date::timestamptz
FROM billing_entry_payments bep
JOIN billing_entries be ON be.id = bep.entry_id
WHERE be.direction = 'income'
  AND NOT EXISTS (SELECT 1 FROM customer_ledger_payments p WHERE p.id = bep.id);
