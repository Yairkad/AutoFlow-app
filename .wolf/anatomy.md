# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-07T16:51:55.732Z
> Files: 25 tracked | Anatomy hits: 0 | Misses: 0

## ../../

- `citycell_prices.csv` (~1175 tok)

## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/09f05ae2-13fa-41eb-916f-813c69742d07/scratchpad/

- `dump_forecast.py` — col_to_num, cell_ref_col, excel_date (~563 tok)
- `dump_xlsx.py` — col_to_num, cell_ref_col, excel_date (~748 tok)
- `dump_xlsx2.py` — col_to_num, cell_ref_col, excel_date (~910 tok)

## ../../../.claude/plans/

- `lively-imagining-tarjan.md` — תכנון: תשלום מרובה-חובות, אמצעי תשלום, הוספת ספק מהירה, כרטיסים (~1169 tok)
- `vivid-launching-squid.md` — צ'קים לא-משובצים: אפשרות "התעלם" + שיבוץ לחוב סגור (~837 tok)

## ../../../.claude/projects/c--Users-----------Desktop-projects-autoline-app/memory/


## ../../../AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/b832685e-2011-43a5-a71e-5b15984bedbf/scratchpad/

- `make_csv.py` (~1624 tok)

## ./


## .claude/


## .claude/rules/


## app/


## app/accessibility/


## app/alignment/


## app/api/admin/create-user/


## app/api/admin/delete-user/


## app/api/admin/generate-invite/


## app/api/auth/register-employee/


## app/api/auth/send-reset/


## app/api/dev-login/


## app/api/drive/auth/


## app/api/drive/callback/


## app/api/drive/delete/


## app/api/drive/disconnect/


## app/api/drive/files/


## app/api/drive/merge/


## app/api/drive/status/


## app/api/drive/upload/


## app/api/employees/complete-registration/


## app/api/employees/invite/


## app/api/onboarding/complete/


## app/api/public/customer-search/


## app/api/public/plate/


## app/api/store/


## app/api/yard/barcode/


## app/api/yard/receive/


## app/api/yard/search/


## app/api/yard/services/


## app/api/yard/services/[id]/


## app/api/yard/sessions/


## app/api/yard/sessions/[id]/


## app/api/yard/sessions/[id]/items/


## app/api/yard/sessions/[id]/items/[itemId]/


## app/api/yard/vehicle-history/


## app/auth/callback/


## app/billing/


## app/cars/


## app/dashboard/


## app/debts/


## app/documents/


## app/employees/


## app/expenses/


## app/income/


## app/inspections/


## app/login/


## app/my-profile/


## app/onboarding/


## app/privacy/


## app/products/


## app/quotes/


## app/register/


## app/reminders/


## app/reset-password/


## app/scan/


## app/set-password/


## app/settings/


## app/supplier-tracking/

- `page.tsx` — SupplierTrackingPage (~79 tok)

## app/suppliers/


## app/terms/


## app/test-transfer/


## app/tires/


## app/tires/inventory-count/


## app/track/[token]/


## app/ui-demo/


## app/yard-office/


## app/yard/


## app/yard/[id]/


## app/yard/[id]/search/


## app/yard/[id]/service/


## app/yard/[id]/tire/


## app/yard/new/


## app/yard/receive/


## components/alignment/


## components/billing/

- `BillingClient.tsx` — fmt (~20062 tok)

## components/cars/


## components/dashboard/


## components/debts/

- `DebtsClient.tsx` — fmt (~10404 tok)

## components/documents/

- `DocumentsClient.tsx` — emptyForm — renders table (~23489 tok)

## components/employees/


## components/expenses/

- `ExpensesClient.tsx` — DEFAULT_EXPENSE_CATS (~21193 tok)
- `ScheduledPaymentsModal.tsx` — monthKeyOf (~13691 tok)

## components/inspections/


## components/landing/


## components/layout/

- `Sidebar.tsx` — NAV_ITEMS (~5333 tok)
- `SidebarLayoutEditor.tsx` — SIDEBAR_LAYOUT_KEY (~3558 tok)

## components/products/


## components/quotes/


## components/reminders/


## components/scan/


## components/settings/


## components/supplier-tracking/

- `SupplierTrackingClient.tsx` — fmt (~22689 tok)

## components/suppliers/

- `QuickAddSupplierModal.tsx` — QuickAddSupplierModal — renders modal (~794 tok)
- `SuppliersClient.tsx` — ISRAELI_BANKS (~10675 tok)

## components/test-transfer/


## components/tires/


## components/ui/


## components/yard/


## lib/

- `uiSettings.ts` — Read ui_settings from the current user's tenant (~395 tok)

## lib/auth/


## lib/contexts/


## lib/debts/

- `reconcileSupplierPayment.ts` — Exports DebtAllocation, reconcileSupplierPayment (~439 tok)

## lib/hooks/


## lib/supabase/


## lib/utils/


## lib/yard/


## public/


## scripts/


## supabase/migrations/

- `061_expenses_amortization_and_recurring_link.sql` — Link a materialized expense back to the recurring template it came from, (~92 tok)
- `062_supplier_check_reconciliation.sql` — Check number/series bookkeeping, and an explicit (user-chosen) ledger of which (~273 tok)
- `063_billing_vat_period_fixed_addon.sql` — Optional multi-month period for irregular meter readings, and an optional (~184 tok)
- `064_supplier_debt_direction.sql` — A supplier debt row can be a charge (regular invoice, adds to what's owed) (~78 tok)
- `065_scheduled_payments_ignore_allocation.sql` — Lets the user dismiss the "unlinked check" warning for checks that are (~69 tok)

## tests/


## tests/fixtures/

