# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-09-17T11:49:54.168Z
> Files: 22 tracked | Anatomy hits: 0 | Misses: 0

## ../../


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/09f05ae2-13fa-41eb-916f-813c69742d07/scratchpad/


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/701f87d8-2649-4232-980f-6539f2a68d78/scratchpad/


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/8c4bc7d5-59ef-4912-97ea-a0c1fe807875/scratchpad/


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/e595c8a6-b0b1-4a83-8e29-3cc073550cc3/scratchpad/


## ../../../.claude/plans/


## ../../../.claude/projects/c--Users-----------Desktop-projects-autoline-app/memory/


## ../../../AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/b832685e-2011-43a5-a71e-5b15984bedbf/scratchpad/


## ../../../root/.claude/plans/


## ../../../tmp/claude-0/-home-user-AutoFlow-app/1a6330e0-c7df-5fd1-9989-e62c909f1848/scratchpad/


## ../../../tmp/claude-0/-home-user-AutoFlow-app/1f5518b3-afe9-58fc-807e-f4fc20f70cf0/scratchpad/


## ./

- `_tmp_resolve_memory.mjs` — Declares path (~151 tok)

## .claude/


## .claude/rules/


## app/

- `globals.css` — Styles: 50 rules, 23 vars (~6406 tok)

## app/(app)/


## app/(app)/alignment/


## app/(app)/bank-sync/


## app/(app)/billing/


## app/(app)/cars/


## app/(app)/checks/


## app/(app)/customers/


## app/(app)/dashboard/


## app/(app)/debts/


## app/(app)/documents/


## app/(app)/employees/


## app/(app)/expenses/


## app/(app)/income/


## app/(app)/inspections/


## app/(app)/my-profile/


## app/(app)/products/


## app/(app)/quotes/


## app/(app)/reminders/


## app/(app)/reports/


## app/(app)/scan/


## app/(app)/settings/


## app/(app)/suppliers/


## app/(app)/test-transfer/


## app/(app)/tires/


## app/(app)/tires/inventory-count/


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


## app/suppliers/


## app/terms/


## app/test-pdf-compress/


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


## app/yard/tire-lookup/


## components/alignment/


## components/bank-sync/

- `ImportWizard.tsx` — SEL (~4985 tok)
- `ReconciliationReview.tsx` — SEL (~4271 tok)
- `types.ts` — Exports BankSource, BankImport, LineStatus, BankLine (~320 tok)

## components/billing/


## components/cars/


## components/checks/


## components/customers/

- `CustomerDetailsTab.tsx` — "פרטים" tab: flat customer record CRUD (name/contact/etc), no expand state (~10100 tok)
- `CustomersClient.tsx` — Shell: loads customers/debts/payments, tab switch (מעקב/פרטים), first-load-only loading spinner via hasLoadedRef (~2300 tok)
- `CustomerTrackingTab.tsx` — "מעקב" tab: per-customer accordion, month blocks, debt/invoice CRUD modal, bulk-edit, pay/print/Excel; search box also matches doc_number/invoices[].number, not just name/description (2026-09-17) (~26461 tok)

## components/dashboard/

- `DashboardStats.tsx` — Draggable KPI card grid (income/expenses/debts/etc), tenant-saved layout; "debts" card now sums customer_ledger_debts+payments (main ledger) grouped per customer, plus old customer_debts (occasional/transfer-verification) — was reading only the stale customer_debts table (2026-09-17) (~8466 tok)

## components/debts/


## components/documents/


## components/employees/


## components/expenses/


## components/inspections/


## components/landing/


## components/layout/

- `AppShell.tsx` — Wraps Header+Sidebar+children in ProfileProvider; <main> margin-right:var(--sidebar-w) (~200 tok)
- `Header.tsx` — Clock, global search (Ctrl+K) w/ category-filter chips (CategoryChips), notification bell, user dropdown; search now also covers `customers`, invoice number (`doc_number`) on `customer_ledger_debts`/`supplier_debts` (2026-09-17); hamburger+search-icon shown at <=900px (~10343 tok)
- `Sidebar.tsx` — NAV_ITEMS/SECTIONS, module-gated nav (isModuleVisible); at <=900px sidebar is a hamburger-triggered 240px drawer (--sidebar-w:0, aside slides via data-mobile-open, globals.css) — NOT an icon-only rail, that approach was tried+reverted (bug-036/037); yard quick-launch gated by isAdmin||modules.includes('yard') (~5622 tok)

## components/products/


## components/quotes/


## components/reminders/


## components/reports/

- `CashFlowForecastTab.tsx` — fmt — renders table (~2035 tok)
- `UnifiedReportTab.tsx` — fmt — renders table (~1707 tok)

## components/scan/


## components/settings/

- `SettingsClient.tsx` — ALL_MODULES (~30392 tok)

## components/suppliers/

- `SupplierDetailsTab.tsx` — "פרטים" tab: flat supplier record CRUD (name/contact/etc), no expand state (~9300 tok)
- `SuppliersClient.tsx` — Shell: loads suppliers/debts/payments, tab switch (מעקב/פרטים), first-load-only loading spinner via hasLoadedRef (~2600 tok)
- `SupplierTrackingTab.tsx` — "מעקב" tab: per-supplier accordion, month blocks, debt/invoice CRUD modal, bulk-edit, pay/print/Excel; search box also matches doc_number/invoices[].number, not just name/description (2026-09-17) (~38222 tok)

## components/test-transfer/


## components/tires/


## components/ui/


## components/yard/


## lib/


## lib/auth/


## lib/bank-sync/

- `parseStatementFile.ts` — Exports AmountMode, AmountSign, ColumnMapping, ParsedLine + 4 more (~1756 tok)

## lib/contexts/


## lib/debts/


## lib/expenses/


## lib/hooks/


## lib/reports/

- `buildForecast.ts` — Exports ForecastEvent, ForecastResult, buildForecast (~1802 tok)
- `buildUnifiedReport.ts` — Exports MonthlyReportRow, UnifiedReportResult, buildUnifiedReport (~1993 tok)

## lib/supabase/


## lib/utils/


## lib/yard/


## public/


## scripts/


## supabase/migrations/

- `082_bank_statement_charge_date_card.sql` — Credit-card statements commonly carry two distinct dates per transaction -- (~172 tok)

## tests/


## tests/fixtures/

