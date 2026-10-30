-- Run BEFORE deploying the supplier running-account change (PR #66).
-- The change itself writes nothing — balances are only computed differently on screen —
-- but this keeps an exact copy of today's supplier data and today's balances to compare against.

-- 1) Full copies of the supplier tables (dated names; delete them later when no longer needed)
create table if not exists backup_20261030_supplier_debts         as table supplier_debts;
create table if not exists backup_20261030_supplier_debt_payments as table supplier_debt_payments;
create table if not exists backup_20261030_scheduled_payments     as table scheduled_payments;
create table if not exists backup_20261030_suppliers              as table suppliers;

-- 2) Each supplier's balance as the screen shows it TODAY (old per-invoice method),
--    saved so it can be compared with the new running-account balance after the deploy
create table if not exists backup_20261030_supplier_balances as
select s.tenant_id, s.id as supplier_id, s.name,
       coalesce(sum(case when d.direction = 'credit' then -d.amount
                         when d.is_closed then 0
                         else greatest(d.amount - d.paid, 0) end), 0) as balance_old
from suppliers s
left join supplier_debts d on d.supplier_id = s.id
group by s.tenant_id, s.id, s.name;

-- 3) Payments that were never allocated to an invoice — these are what will now lower the balance
select s.name, p.due_date, p.amount, p.payment_method, p.check_number, p.is_paid
from scheduled_payments p
join suppliers s on s.id = p.supplier_id
where coalesce(p.allocation_ignored, false) = false
  and not exists (select 1 from supplier_debt_payments a where a.scheduled_payment_id = p.id)
order by s.name, p.due_date;
