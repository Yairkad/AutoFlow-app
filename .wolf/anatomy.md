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

- `AlertsPanel.tsx` — "⚡ התראות" dashboard widget (desktop bar + mobile compact popover): queries unpaid `scheduled_payments`(due≤30d, then client-filtered to `CHECK_ALERT_DAYS=5` for `payment_method==='check'` only — transfers keep the 30d window)/unpaid `salaries`/open `customer_debts`(7d+), renders as colored chips with `dayLabel()`/`chipStyle()` ("⚠️ Xי' באיחור" etc). `load()` now awaits `autoMarkOverdueChecksPaid` first (via `useProfile().tenantId`) so overdue checks are already flipped to paid and excluded by the `is_paid=false` filter (~1250 tok)

## components/debts/


## components/documents/


## components/employees/


## components/expenses/

- `ScheduledPaymentsModal.tsx` — "📅 תשלומים מתוזמנים" modal: add/edit/delete post-dated checks & transfers, check-series batch creation, debt-month allocation via `reconcileSupplierPayment`, Excel import/export. `statusInfo()` derives the status chip purely from `is_paid`+`due_date`; `fetch()` now awaits `autoMarkOverdueChecksPaid` first so overdue checks flip to paid before the list renders. Manual "✓ שולם" button (`markPaid()`) still exists for transfers and for early/manual check settlement (~2200 tok)

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

- `SupplierTrackingClient.tsx` — Main supplier debt tracking page ("מעקב ספקים"): supplier cards (collapsed by default) expand to per-month debt/credit blocks, each month collapsed by default too (own toggle, `expandedMonthKeys`); each invoice row has inline ✏️/🗑 buttons opening the edit modal directly (no need to scroll to the top selection bar); checks calendar tab, payment/allocation modals, Excel import; styled print now supports choosing "all/specific months/date range" for the ledger, seeded by the supplier's opening_balance + prior debts as a running "יתרה בפועל" column. loadAll()'s suppliers query now toasts on error instead of silently leaving suppliers=[] (see bug-005 — a missing migration column errors this query and made every row show "ללא ספק") (~12400 tok)

## components/suppliers/

- `SuppliersClient.tsx` — Main "ספקים / נותני שירות" page: master-detail layout, supplier list as responsive card grid (repeat(auto-fill, minmax(260px,1fr))) + detail/edit panel on select; edit form now includes `opening_balance` (יתרת פתיחה) feeding the supplier-tracking printed ledger (~10900 tok)

## components/test-transfer/


## components/tires/


## components/ui/


## components/yard/


## lib/


## lib/auth/


## lib/contexts/

- `ProfileContext.tsx` — `ProfileProvider`/`useProfile()`: fetches session+profile+full tenant row ONCE per AppShell mount, wired into `AppShell` above Header/Sidebar/page children. On successful load, if role is admin/super_admin, fire-and-forget calls `autoMarkOverdueChecksPaid(sb, tenantId)` (session-level pass so overdue checks are settled as soon as any admin page loads) (~700 tok)

## lib/debts/


## lib/hooks/


## lib/supabase/


## lib/utils/

- `autoMarkOverdueChecks.ts` — `autoMarkOverdueChecksPaid(supabase, tenantId)`: for `scheduled_payments` rows with `payment_method='check', is_paid=false, due_date<=today`, race-guarded flips `is_paid=true`+`paid_date`, then inserts a matching `expenses` row and backfills `expense_id` (mirrors `ScheduledPaymentsModal`'s manual markPaid()). Called from `ProfileContext.load()` (session-level, admin-gated), and defensively re-run inside `ScheduledPaymentsModal.fetch()` and `AlertsPanel.load()` (~200 tok)


## lib/yard/


## public/


## scripts/


## supabase/migrations/


## tests/

- `_tmp_grid_check.spec.ts` — Declares BASE (~510 tok)

## tests/fixtures/

