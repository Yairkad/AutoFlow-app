# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-22T10:53:24.651Z
> Files: 30 tracked | Anatomy hits: 0 | Misses: 0

## ../../


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/09f05ae2-13fa-41eb-916f-813c69742d07/scratchpad/


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/701f87d8-2649-4232-980f-6539f2a68d78/scratchpad/


## ../../../../0411~1/AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/8c4bc7d5-59ef-4912-97ea-a0c1fe807875/scratchpad/


## ../../../.claude/plans/

- `tidy-launching-melody.md` — Merge "חשבונות" (Billing) into Supplier/Customer Tracking (~4920 tok)

## ../../../.claude/projects/c--Users-----------Desktop-projects-autoline-app/memory/


## ../../../AppData/Local/Temp/claude/c--Users-----------Desktop-projects-autoline-app/b832685e-2011-43a5-a71e-5b15984bedbf/scratchpad/


## ./

- `_tmp_manual_verify.mjs` — API routes: GET (1 endpoints) (~537 tok)
- `_tmp_manual_verify2.mjs` — API routes: GET (1 endpoints) (~1012 tok)
- `_tmp_verify_migration.mjs` — env: count (~749 tok)
- `package.json` — Node.js package manifest (~328 tok)
- `proxy.ts` — ── Public paths – no auth needed ────────────────────────────────────────── (~1219 tok)

## .claude/


## .claude/rules/


## app/


## app/(app)/


## app/(app)/alignment/


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

- `BillingClient.tsx` — fmt (~19630 tok)

## components/cars/


## components/checks/

- `ChecksJournalClient.tsx` — fmt (~8993 tok)

## components/customers/

- `CustomerDetailsTab.tsx` — CustomerDetailsTab (~7374 tok)
- `CustomersClient.tsx` — CustomersClient (~1809 tok)
- `CustomerTrackingTab.tsx` — fmtDMY (~25755 tok)
- `shared.ts` — Shared types/helpers for the merged /customers page (CustomerDetailsTab + CustomerTrackingTab). (~674 tok)

## components/dashboard/


## components/debts/

- `CallLogModal.tsx` — fmtDT (~1464 tok)
- `DebtsClient.tsx` — fmt (~10481 tok)

## components/documents/


## components/employees/


## components/expenses/


## components/inspections/


## components/landing/


## components/layout/

- `Sidebar.tsx` — NAV_ITEMS (~5359 tok)
- `SidebarLayoutEditor.tsx` — SIDEBAR_LAYOUT_KEY (~3573 tok)

## components/products/


## components/quotes/


## components/reminders/


## components/scan/


## components/settings/

- `SettingsClient.tsx` — ALL_MODULES (~30793 tok)

## components/suppliers/

- `shared.ts` — Shared types/helpers for the merged /suppliers page (SupplierDetailsTab + SupplierTrackingTab). (~768 tok)
- `SupplierDetailsTab.tsx` — former `SuppliersClient.tsx` body (profile/rolodex list+detail), now props-driven, no own fetch (~5000 tok)
- `SuppliersClient.tsx` — SuppliersClient (~2444 tok)
- `SupplierTrackingTab.tsx` — fmtDMY (~29860 tok)

## components/test-transfer/


## components/tires/


## components/ui/

- `UnitToggle.tsx` — UnitToggle (~213 tok)
- `VatToggle.tsx` — VatToggle (~220 tok)

## components/yard/


## lib/


## lib/auth/


## lib/contexts/

- `ProfileContext.tsx` — ProfileContext (~776 tok)

## lib/debts/


## lib/hooks/


## lib/supabase/


## lib/utils/

- `vat.ts` — Exports VAT_RATE, withVat, withoutVat (~42 tok)

## lib/yard/


## public/


## scripts/


## supabase/migrations/

- `076_customer_debt_due_date_calls_payments.sql` — "Occasional debtors" (customer_debts, the ad-hoc table behind /debts) get: (~474 tok)

## tests/

- `forms.spec.ts` — Declares label (~1234 tok)
- `navigation.spec.ts` — All app pages and their expected page title text (~804 tok)
- `responsive.spec.ts` — Mobile viewport – same as iPhone 13 (~852 tok)

## tests/fixtures/

- `mock.ts` — Supabase project ref (from env) (~988 tok)
