# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-07T20:42:31.062Z
> Files: 26 tracked | Anatomy hits: 0 | Misses: 0

## ../../


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/09f05ae2-13fa-41eb-916f-813c69742d07/scratchpad/


## ../../../.claude/plans/

- `vivid-launching-squid.md` — Header/Sidebar קבועים בין ניווטים (Next.js route group) (~976 tok)

## ../../../.claude/projects/c--Users-----------Desktop-projects-autoline-app/memory/


## ../../../AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/b832685e-2011-43a5-a71e-5b15984bedbf/scratchpad/


## ./


## .claude/


## .claude/rules/


## app/


## app/(app)/

- `layout.tsx` — AppGroupLayout (~52 tok)

## app/(app)/alignment/

- `page.tsx` — AlignmentPage (~41 tok)

## app/(app)/billing/

- `page.tsx` — BillingPage (~38 tok)

## app/(app)/cars/

- `page.tsx` — CarsPage (~34 tok)

## app/(app)/dashboard/

- `page.tsx` — DashboardPage (~984 tok)

## app/(app)/debts/

- `page.tsx` — DebtsPage (~36 tok)

## app/(app)/documents/

- `page.tsx` — DocumentsPage (~41 tok)

## app/(app)/employees/

- `page.tsx` — EmployeesPage (~41 tok)

## app/(app)/expenses/

- `page.tsx` — ExpensesPage (~46 tok)

## app/(app)/income/

- `page.tsx` — IncomePage (~45 tok)

## app/(app)/inspections/

- `page.tsx` — InspectionsPage (~44 tok)

## app/(app)/my-profile/

- `page.tsx` — labelSt (~2915 tok)

## app/(app)/products/

- `page.tsx` — ProductsPage (~40 tok)

## app/(app)/quotes/

- `page.tsx` — QuotesPage (~37 tok)

## app/(app)/reminders/

- `page.tsx` — RemindersPage (~41 tok)

## app/(app)/scan/

- `page.tsx` — metadata (~48 tok)

## app/(app)/settings/

- `page.tsx` — SettingsPage (~40 tok)

## app/(app)/supplier-tracking/

- `page.tsx` — SupplierTrackingPage (~52 tok)

## app/(app)/suppliers/

- `page.tsx` — SuppliersPage (~41 tok)

## app/(app)/test-transfer/

- `page.tsx` — TestTransferPage (~46 tok)

## app/(app)/tires/

- `page.tsx` — TiresPage (~36 tok)

## app/(app)/tires/inventory-count/

- `page.tsx` — metadata (~60 tok)

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


## components/cars/


## components/dashboard/


## components/debts/


## components/documents/


## components/employees/


## components/expenses/


## components/inspections/


## components/landing/


## components/layout/

- `AppShell.tsx` — AppShell (~330 tok)

## components/products/


## components/quotes/


## components/reminders/


## components/scan/


## components/settings/


## components/supplier-tracking/

- `SupplierTrackingClient.tsx` — Main supplier debt tracking page ("מעקב ספקים"): supplier cards (collapsed by default) expand to per-month debt/credit blocks, each month independently collapsible via its own toggle; each invoice row has inline ✏️/🗑 buttons opening the edit modal directly (no need to scroll to the top selection bar); checks calendar tab, payment/allocation modals, Excel import; styled print now supports choosing "all/specific months/date range" for the ledger, seeded by the supplier's opening_balance + prior debts as a running "יתרה בפועל" column (~12300 tok)

## components/suppliers/

- `SuppliersClient.tsx` — Main "ספקים / נותני שירות" page: master-detail layout, supplier list as responsive card grid (repeat(auto-fill, minmax(260px,1fr))) + detail/edit panel on select; edit form now includes `opening_balance` (יתרת פתיחה) feeding the supplier-tracking printed ledger (~10900 tok)

## components/test-transfer/


## components/tires/


## components/ui/


## components/yard/


## lib/


## lib/auth/


## lib/contexts/


## lib/debts/


## lib/hooks/


## lib/supabase/


## lib/utils/


## lib/yard/


## public/


## scripts/


## supabase/migrations/


## tests/

- `_tmp_grid_check.spec.ts` — Declares BASE (~510 tok)

## tests/fixtures/

