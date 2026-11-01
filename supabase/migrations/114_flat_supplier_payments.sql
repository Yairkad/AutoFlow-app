-- Running-account model: payments are no longer tied to invoices. A supplier payment made with the
-- "תשלום" button (cash / transfer / credit) used to exist only as allocation rows
-- (supplier_debt_payments with no scheduled_payment_id). Turn each such payment into a regular
-- payment row (scheduled_payments, is_paid) on the day it was recorded, and point its allocation
-- rows at it — so running this twice changes nothing. Supplier balances stay exactly the same.
DO $$
DECLARE
  g   RECORD;
  pid uuid;
BEGIN
  FOR g IN
    SELECT a.tenant_id, d.supplier_id, date_trunc('minute', a.created_at) AS at,
           SUM(a.amount) AS amount, array_agg(a.id) AS ids
    FROM supplier_debt_payments a
    JOIN supplier_debts d ON d.id = a.supplier_debt_id
    WHERE a.scheduled_payment_id IS NULL AND d.supplier_id IS NOT NULL
    GROUP BY a.tenant_id, d.supplier_id, date_trunc('minute', a.created_at)
  LOOP
    INSERT INTO scheduled_payments (tenant_id, supplier_id, description, amount, due_date, payment_method, is_paid, paid_date)
    VALUES (g.tenant_id, g.supplier_id, 'תשלום', g.amount, g.at::date, 'transfer', true, g.at::date)
    RETURNING id INTO pid;
    UPDATE supplier_debt_payments SET scheduled_payment_id = pid WHERE id = ANY(g.ids);
  END LOOP;
END $$;
