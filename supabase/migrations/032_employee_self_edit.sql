-- ══════════════════════════════════════════════════════════════════════════
-- 032 · Employee self-edit – allow employees to update their own personal fields
-- ══════════════════════════════════════════════════════════════════════════

-- Employees can read their own record (matched by email)
create policy "employee_self_read" on employees
  for select
  using (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
    and tenant_id = (select tenant_id from profiles where id = auth.uid())
  );

-- Employees can update only their own record
-- (column-level restriction is enforced in the API route, not RLS)
create policy "employee_self_update" on employees
  for update
  using (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
    and tenant_id = (select tenant_id from profiles where id = auth.uid())
  )
  with check (
    lower(email) = lower((select email from auth.users where id = auth.uid()))
    and tenant_id = (select tenant_id from profiles where id = auth.uid())
  );
