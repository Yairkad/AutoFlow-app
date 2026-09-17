-- Bank/credit-card statement import + manual (suggest-not-auto) reconciliation
-- against already-recorded expenses/income, plus the fast quick-capture flow
-- whose "create from statement line" action writes through the same path.
--
-- FK direction: bank_statement_lines points AT expenses/income, never the
-- reverse -- no columns are added to expenses/income at all. This mirrors the
-- existing scheduled_payments.expense_id precedent, and avoids the
-- denormalized-status-drift bug class documented on 079 (bug-020): "is this
-- expense reconciled" is always answered by a live anti-join against
-- bank_statement_lines, never a cached flag that could get out of sync.

-- Saved column-mapping profile per statement source (e.g. "בנק הפועלים עו״ש",
-- "ישראכרט ויזה") -- re-applied automatically on future imports from the same
-- source, still user-editable each time.
CREATE TABLE bank_statement_sources (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  column_mapping         jsonb NOT NULL,
  default_payment_method text,               -- 'מזומן' | 'אשראי' | "צ'ק" | 'העברה' -- prefill for quick-create
  match_tolerance_days   smallint NOT NULL DEFAULT 3,
  created_at             timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- One row per uploaded file ("batch").
CREATE TABLE bank_statement_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id      uuid REFERENCES bank_statement_sources(id) ON DELETE SET NULL,
  file_name      text,
  row_count      integer NOT NULL DEFAULT 0,   -- raw rows seen
  imported_count integer NOT NULL DEFAULT 0,   -- rows actually inserted (excludes header/skipped/dup rows)
  drive_file_id  text,                         -- optional: original file kept in Drive for audit, not required
  imported_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

-- One row per statement line (a single transaction from the imported file).
CREATE TABLE bank_statement_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_id          uuid NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  source_id          uuid REFERENCES bank_statement_sources(id) ON DELETE SET NULL,  -- denormalized copy, for cheap same-source duplicate lookups across imports
  row_index          integer,             -- original row number in the uploaded file (debug/traceability)
  date               date NOT NULL,
  description        text NOT NULL DEFAULT '',
  direction          text NOT NULL CHECK (direction IN ('debit', 'credit')),  -- debit = money out (matches expenses); credit = money in (matches income)
  amount             numeric(10,2) NOT NULL CHECK (amount > 0),               -- always positive; direction carries the sign
  balance_after      numeric(10,2),       -- optional running balance, if the source file has one -- display only, no forecast logic reads this yet
  raw_row            jsonb,               -- full original row array, for a "view raw row" debug action
  status             text NOT NULL DEFAULT 'unmatched'
                        CHECK (status IN ('unmatched', 'matched', 'created', 'ignored')),
  matched_expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  matched_income_id  uuid REFERENCES income(id) ON DELETE SET NULL,
  match_confidence   text CHECK (match_confidence IN ('exact', 'approx')),  -- informational only; 'exact' = same-day, 'approx' = within tolerance window
  ignored_reason     text,                -- e.g. 'העברה פנימית' | 'משיכת מזומן' | 'אחר', set when status='ignored'
  reconciled_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reconciled_at      timestamptz,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX idx_bsl_tenant_status   ON bank_statement_lines(tenant_id, status);
CREATE INDEX idx_bsl_import          ON bank_statement_lines(import_id);
CREATE INDEX idx_bsl_source_date_amt ON bank_statement_lines(source_id, date, amount);  -- duplicate-detection on re-import

-- An expense/income row can be claimed by at most one statement line -- prevents
-- two different lines both confirming a match against the same underlying record.
CREATE UNIQUE INDEX idx_bsl_matched_expense_unique
  ON bank_statement_lines(matched_expense_id) WHERE matched_expense_id IS NOT NULL;
CREATE UNIQUE INDEX idx_bsl_matched_income_unique
  ON bank_statement_lines(matched_income_id) WHERE matched_income_id IS NOT NULL;

ALTER TABLE bank_statement_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_statement_sources_tenant_isolation" ON bank_statement_sources
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "bank_statement_imports_tenant_isolation" ON bank_statement_imports
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "bank_statement_lines_tenant_isolation" ON bank_statement_lines
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
