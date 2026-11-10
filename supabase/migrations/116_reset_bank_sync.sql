-- Reset bank / credit-card reconciliation: delete every import, its lines and saved sources,
-- plus the expenses / income rows that were CREATED from a statement line ("✓ צור הוצאה").
-- Expenses / income that were only MATCHED to a line were recorded by hand — they stay.
-- One-time cleanup before the import flow is redesigned. Irreversible.

begin;

-- 1) Rows created from a statement line (status 'created')
delete from expenses
where id in (select matched_expense_id from bank_statement_lines
             where status = 'created' and matched_expense_id is not null);

delete from income
where id in (select matched_income_id from bank_statement_lines
             where status = 'created' and matched_income_id is not null);

-- 2) Imports (bank_statement_lines go with them: ON DELETE CASCADE)
delete from bank_statement_lines;
delete from bank_statement_imports;

-- 3) Saved sources (column mappings + learned category rules)
delete from bank_statement_sources;

commit;
