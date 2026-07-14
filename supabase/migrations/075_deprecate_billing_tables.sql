-- Retires the old billing tables now that their data lives in
-- suppliers/customers/supplier_debts/customer_ledger_debts (+ payments).
-- Renamed, not dropped -- this is real financial history. A future migration
-- can DROP these once the merge has been confirmed solid in production for
-- a full cycle.
ALTER TABLE billing_contacts       RENAME TO _deprecated_billing_contacts;
ALTER TABLE billing_items          RENAME TO _deprecated_billing_items;
ALTER TABLE billing_entries        RENAME TO _deprecated_billing_entries;
ALTER TABLE billing_entry_payments RENAME TO _deprecated_billing_entry_payments;
