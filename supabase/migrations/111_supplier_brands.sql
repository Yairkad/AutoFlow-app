-- Tire brands each supplier (importer) brings. Learned from what arrives on its invoices and
-- editable by hand in the supplier card; "מה הגיע?" suggests these brands first.
alter table suppliers add column if not exists brands text[] not null default '{}';

-- First fill from what is already known: tires linked to the supplier and invoice lines received from it
update suppliers s set brands = coalesce((
  select array_agg(distinct b) from (
    select t.brand as b from tires t where t.supplier_id = s.id and coalesce(t.brand, '') <> ''
    union
    select t.brand from supplier_invoice_items i
      join supplier_debts d on d.id = i.debt_id
      join tires t on t.id = i.ref_id
      where i.item_type = 'tire' and d.supplier_id = s.id and coalesce(t.brand, '') <> ''
  ) x
), '{}')
where s.brands = '{}';
