# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-14T15:20:53.034Z
> Files: 11 tracked | Anatomy hits: 0 | Misses: 0

## ../../


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/09f05ae2-13fa-41eb-916f-813c69742d07/scratchpad/


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/8c4bc7d5-59ef-4912-97ea-a0c1fe807875/scratchpad/

- `verify-checks.js` — Declares browser (~450 tok)

## ../../../.claude/plans/


## ../../../.claude/projects/c--Users-----------Desktop-projects-autoline-app/memory/


## ../../../AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/b832685e-2011-43a5-a71e-5b15984bedbf/scratchpad/


## ./

- `.gitignore` — Git ignore rules (~201 tok)

## .claude/


## .claude/rules/


## app/


## app/(app)/


## app/(app)/alignment/


## app/(app)/billing/


## app/(app)/cars/


## app/(app)/checks/

- `page.tsx` — ChecksPage, wraps ChecksJournalClient (~30 tok)

## app/(app)/customer-tracking/


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


## app/(app)/scan/


## app/(app)/settings/


## app/(app)/supplier-tracking/


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


## components/checks/

- `ChecksJournalClient.tsx` — "יומן צ'קים" page (`/checks`), the new top-level checks-only view (payment_method='check' only, transfers stay in Expenses). Filters (supplier/payee, check-number range, due-date range, status, text search) over all tenant `scheduled_payments`, grouped by due-month with per-month + grand totals. Reuses `ScheduledPaymentsModal` for add/edit/series (via new `initialOpenAdd`/`initialEditItem` props) and for Excel import (opens its list view); has its own filtered-scope Excel export (exceljs, adapted from the modal's) and styled print. Row-level mark-paid uses shared `lib/utils/markCheckPaid.ts`. Reads `?supplier=<id>` deep-link from `SupplierTrackingClient`/`SuppliersClient`-style links. Unlinked-to-debt checks show a read-only ⚠ badge linking to `/supplier-tracking?open=<id>` — the actual retroactive-allocation picker stays there, not duplicated here (~9500 tok)

## components/customer-tracking/

- `CustomerTrackingClient.tsx` — fmt (~21358 tok)

## components/customers/


## components/dashboard/


## components/debts/


## components/documents/


## components/employees/


## components/expenses/


## components/inspections/


## components/landing/


## components/layout/

- `Sidebar.tsx` — nav config: `NAV_ITEMS`/`ICONS`/`SECTIONS`. Now includes `/checks` ("יומן צ'קים", module `['expenses','suppliers']`, in the `'כספים'` section next to `/expenses`) (~5900 tok)

## components/products/


## components/quotes/


## components/reminders/


## components/scan/


## components/settings/


## components/supplier-tracking/

- `SupplierTrackingClient.tsx` — main supplier debt tracking page ("מעקב ספקים"). The old "📅 יומן צ׳קים" calendar tab (+ its Excel export branch + its print option) was **removed** — checks now live on the dedicated `/checks` page (`ChecksJournalClient.tsx`). Only the `byMonth` view remains (no more tab bar/`Tab` type); added a "📅 יומן צ׳קים" link to `/checks` in the toolbar and a per-supplier "📅 יומן הצ׳קים" link to `/checks?supplier=<id>` in each expanded supplier-card header. `scheduledPayments` fetch/realtime + the embedded per-supplier-month payments list + the unlinked-payment allocation/ignore banner are unchanged (~23000 tok)

## components/suppliers/


## components/test-transfer/


## components/tires/


## components/ui/


## components/yard/


## lib/


## lib/auth/


## lib/contexts/


## lib/debts/

- `reconcileCustomerLedgerPayment.ts` — Exports CustomerDebtAllocation, CustomerPaymentMeta, reconcileCustomerLedgerPayment (~629 tok)

## lib/hooks/


## lib/supabase/


## lib/utils/

- `autoMarkOverdueChecks.ts` — `autoMarkOverdueChecksPaid(supabase, tenantId)`: for `scheduled_payments` rows with `payment_method='check', is_paid=false, due_date<=today`, race-guarded flips `is_paid=true`+`paid_date`, then inserts a matching `expenses` row and backfills `expense_id`. Called from `ProfileContext.load()` (session-level, admin-gated), and defensively re-run inside `ScheduledPaymentsModal.fetch()`, `AlertsPanel.load()`, and `ChecksJournalClient.load()` (~200 tok)
- `markCheckPaid.ts` — `markScheduledPaymentPaid(supabase, tenantId, payment, {paidDate, category, description})`: inserts the matching `expenses` row then flips `scheduled_payments.is_paid/paid_date/expense_id`. Extracted from `ScheduledPaymentsModal.markPaid()` so `ChecksJournalClient.tsx` (`/checks`) can reuse the exact same logic for its own row-level "✓ שולם" action. Distinct from `autoMarkOverdueChecks.ts` (race-guarded, no user input, auto-fires at due_date) — this one is the user-driven manual/early-settle path (~350 tok)

## lib/yard/


## public/


## scripts/


## supabase/migrations/

- `072_customer_ledger_payment_receipt.sql` — Lets a customer-ledger payment record whether a receipt (קבלה) was issued (~134 tok)

## tests/


## tests/fixtures/

