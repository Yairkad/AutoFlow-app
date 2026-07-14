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

## app/(app)/customers/

- `page.tsx` — CustomersPage, wraps CustomersClient (~30 tok)

## app/(app)/customer-tracking/

- `page.tsx` — CustomerTrackingPage, wraps CustomerTrackingClient (~30 tok)

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


## components/customer-tracking/

- `CustomerTrackingClient.tsx` — "מעקב לקוחות" page, structural mirror of `supplier-tracking/SupplierTrackingClient.tsx` for the new customer-ledger feature (`customers`/`customer_ledger_debts`/`customer_ledger_payments` tables). Same by-customer/by-month grouping, invoice-line add/edit modal, direct payment modal (4 methods incl. inline check-number/date fields — no check-series/calendar system per product decision), styled print ledger, Excel import/export, WhatsApp. `direction:'charge'` here means the CUSTOMER owes the business (inverted vs. supplier meaning) — `bal()` formula itself unchanged. Deep-link `?open=<customerId>`. Printed ledger's "יתרה בפועל" running column now nets `d.paid` per debt (bug-011, 2026-07-14) — unlike the supplier print ledger, which deliberately stays gross/unnetted. Printed ledger now has a real letterhead (`.pp-hdr`/`.pp-biz`/`.pp-logo-wrap`, sourced from `profile.tenant` — name/sub_title/address/phone/license_number/tax_id/logo_base64) matching the pattern used by DocumentsClient/InspectionsClient print (2026-07-14, was previously just a plain `<h2>`). `customer_ledger_payments` rows now fetched into `customerPayments` state and shown as their own line-items grouped by the payment's `created_at` month (not the debt's month) inside each month's accordion, below the invoice table — each row has a "🧾 יצאה / ⏳ לא יצאה" toggle button (`toggleReceiptIssued`) writing to the new `receipt_issued` boolean column (migration 072). The payment-recording modal has a matching "קבלה הופקה" checkbox (`payReceiptIssued`) that seeds the flag at record time; can still be flipped later per-row (~9600 tok)

## components/customers/

- `CustomersClient.tsx` — "לקוחות (כרטסת)" master/detail page, structural mirror of `suppliers/SuppliersClient.tsx` minus bank-details fields and next-check card (no checks concept for customers). Fields: name/category/phone/email/address/notes/opening_balance. Links to `/customer-tracking?open=<id>` (~4500 tok)
- `QuickAddCustomerModal.tsx` — mirrors `suppliers/QuickAddSupplierModal.tsx` minus contact_name; name-only-required, inserts into `customers` (~500 tok)

## components/dashboard/

- `AlertsPanel.tsx` — "⚡ התראות" dashboard widget (desktop bar + mobile compact popover): queries unpaid `scheduled_payments`(due≤30d, then client-filtered to `CHECK_ALERT_DAYS=5` for `payment_method==='check'` only — transfers keep the 30d window)/unpaid `salaries`/open `customer_debts`(7d+), renders as colored chips with `dayLabel()`/`chipStyle()` ("⚠️ Xי' באיחור" etc). `load()` now awaits `autoMarkOverdueChecksPaid` first (via `useProfile().tenantId`) so overdue checks are already flipped to paid and excluded by the `is_paid=false` filter (~1250 tok)

## components/debts/

- `DebtsClient.tsx` — "חובות" page: ad-hoc `customer_debts` flat CRUD table (customers tab, untouched legacy feature), suppliers tab (summary card grid linking to /supplier-tracking), summary tab (stat cards + top-debtor lists). Now also fetches `customer_ledger_debts`/`customers` (the new curated customer-ledger feature) and renders a second "💳 לקוחות בכרטסת" card-grid section below the old table (not merged with it) linking to /customer-tracking, plus a 4th summary stat card; `netOwed` folds in `openCustLedgerTotal` alongside the old `openCustTotal` (~5500 tok)

## components/documents/


## components/expenses/

- `ScheduledPaymentsModal.tsx` — the "checks" (צ'קים) modal: list + add/edit form (two sibling `<Modal>`s gated by `open && !formOpen`/`formOpen`), single-payment and check-series creation (equal-split or round+remainder), debt-allocation checkboxes feeding `reconcileSupplierPayment`, Excel import/export. Used by both `SupplierTrackingClient.tsx` (passes `initialSupplierId`/`initialSelectedDebtIds`/`initialDebtAllocAmounts` to auto-open pre-filled + pre-seeded) and `ExpensesClient.tsx` (generic entry, no auto-open). Series due-dates built via local-only `toLocalISODate()` (see bug-008 — previously went through `toISOString()` and shifted a day in Israel's UTC+2/+3). All three save-success branches call `onClose()` (see bug-010) so the modal fully closes rather than falling back to the list (~5000 tok)

## components/employees/


## components/expenses/

- `ScheduledPaymentsModal.tsx` — "📅 תשלומים מתוזמנים" modal: add/edit/delete post-dated checks & transfers, check-series batch creation, debt-month allocation via `reconcileSupplierPayment`, Excel import/export. `statusInfo()` derives the status chip purely from `is_paid`+`due_date`; `fetch()` now awaits `autoMarkOverdueChecksPaid` first so overdue checks flip to paid before the list renders. Manual "✓ שולם" button (`markPaid()`) still exists for transfers and for early/manual check settlement (~2200 tok)

## components/expenses/


## components/inspections/

- `InspectionChecklistModal.tsx` — Pre-purchase vehicle inspection checklist drawer (21 MOT systems). Per-system status ('ok'|'fail'|''|'na') is resolved from that step's fault list by `commitCurrentStep()`, called on every navigation exit (next/prev/pill-jump/summary) — see bug-006. `printChecklist()` renders the 2-page A4 "טופס סיכום אחיד" with ✓/✗ per system; skeleton-only mode (SKELETON_SYSTEM_INDICES) marks non-skeleton systems 'na' with strikethrough. `ChecklistBadge` shows a pass/fail chip on history cards (~5000 tok)

## components/landing/


## components/layout/

- `AppShell.tsx` — AppShell (~330 tok)
- `Sidebar.tsx` — nav config: `NAV_ITEMS` (href/label/color/module), `SECTIONS` (grouping), `ICONS` (SVG per href); module-gated via `profile.allowedModules`. Includes `/customer-tracking` + `/customers` (module `'customers'`) alongside the existing `/supplier-tracking` + `/suppliers` (module `'suppliers'`) (~2500 tok)

## components/products/


## components/quotes/


## components/reminders/


## components/scan/


## components/settings/

- `SettingsClient.tsx` — tenant settings: user/role management (`ALL_MODULES` permission list, incl. `'customers'` module), backup/restore (`BACKUP_TABLES` array — incl. `customers`/`customer_categories`/`customer_ledger_debts`/`customer_ledger_payments`), landing-page prices, Drive integration, vault. Very large file (1600+ lines) — grep for the section you need rather than reading in full

## components/supplier-tracking/

- `SupplierTrackingClient.tsx` — Main supplier debt tracking page ("מעקב ספקים"): supplier cards (collapsed by default) expand to per-month debt/credit blocks, each month collapsed by default too (own toggle, `expandedMonthKeys`); each invoice row has inline ✏️/🗑 buttons opening the edit modal directly (no need to scroll to the top selection bar); checks calendar tab, payment/allocation modals, Excel import; styled print now supports choosing "all/specific months/date range" for the ledger, seeded by the supplier's opening_balance + prior debts as a running "יתרה בפועל" column. loadAll()'s suppliers query now toasts on error instead of silently leaving suppliers=[] (see bug-005 — a missing migration column errors this query and made every row show "ללא ספק") (~12400 tok)

## components/suppliers/

- `SuppliersClient.tsx` — Main "ספקים / נותני שירות" page: master-detail layout, supplier list as responsive card grid (repeat(auto-fill, minmax(260px,1fr))) + detail/edit panel on select; edit form now includes `opening_balance` (יתרת פתיחה) feeding the supplier-tracking printed ledger (~10900 tok)

## components/test-transfer/


## components/tires/


## components/ui/


## components/yard/

- `WorkCardClient.tsx` — "רכב בטיפול" work-card page (a car currently on the lift/lot): item cart, quick-add services, and barcode scan (`handleBarcodeScan` → `/api/yard/barcode`) to add a tire/product/service to the session. Scan now rejects out-of-stock matches (`item.stock<=0` → "פריט אזל מהמלאי") instead of silently adding them (bug-012, 2026-07-14). Session `status` transitions: `active` → `pending_office` (`sendToOffice`) → `archived` (office closes it) — inventory is only deducted at `archived`, in `app/api/yard/sessions/[id]/route.ts`, not when items are added here.
- `FreeSearchClient.tsx` — full-text/manual product-tire-service search page (`/yard/[id]/search`) for adding items to a work-card without scanning; also has its own barcode-scan entry point (`handleBarcode`, camera + hidden-input physical scanner) hitting the same `/api/yard/barcode`. Same out-of-stock check as WorkCardClient added 2026-07-14; also fixed a null-deref crash — `/api/yard/barcode` returns HTTP 200 with a `null` body on no-match, so the old `!res.ok` check never actually caught "not found".


## lib/


## lib/auth/


## lib/contexts/

- `ProfileContext.tsx` — `ProfileProvider`/`useProfile()`: fetches session+profile+full tenant row ONCE per AppShell mount, wired into `AppShell` above Header/Sidebar/page children. On successful load, if role is admin/super_admin, fire-and-forget calls `autoMarkOverdueChecksPaid(sb, tenantId)` (session-level pass so overdue checks are settled as soon as any admin page loads) (~700 tok)

## lib/debts/

- `reconcileSupplierPayment.ts` — applies a user-chosen allocation of a payment against specific `supplier_debts` rows (updates paid/is_closed, inserts `supplier_debt_payments`); never FIFO, caller picks which debt(s) (~300 tok)
- `reconcileCustomerLedgerPayment.ts` — mirrors `reconcileSupplierPayment.ts` for the new customer-ledger feature (`customer_ledger_debts`/`customer_ledger_payments`); takes a `paymentMeta` object (method/check_number/check_date/notes) instead of a `scheduledPaymentId` since customers have no check-series concept (~350 tok)


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

