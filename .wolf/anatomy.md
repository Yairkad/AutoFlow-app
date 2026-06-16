# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-06-16T06:01:18.144Z
> Files: 244 tracked | Anatomy hits: 0 | Misses: 0

## ../../../.claude/projects/c--Users-----------Desktop-projects-autoline-app/memory/

- `MEMORY.md` — Memory Index (~30 tok)
- `project_yad2_search.md` (~255 tok)

## ./

- `.gitignore` — Git ignore rules (~141 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `eslint.config.mjs` — ESLint flat configuration (~124 tok)
- `landing-redesign-demo.html` — אוטו ליין – הדמיה רידיזיין (~7611 tok)
- `next-env.d.ts` — / <reference types="next" /> (~72 tok)
- `next.config.ts` — Next.js configuration (~30 tok)
- `package-lock.json` — npm lock file (~74796 tok)
- `package.json` — Node.js package manifest (~322 tok)
- `playwright.config.ts` — Playwright test configuration (~244 tok)
- `postcss.config.mjs` — Declares config (~26 tok)
- `proxy.ts` — ── Public paths – no auth needed ────────────────────────────────────────── (~1218 tok)
- `README.md` — Project documentation (~363 tok)
- `tsconfig.json` — TypeScript configuration (~191 tok)
- `tsconfig.tsbuildinfo` (~66462 tok)

## .claude/

- `settings.json` (~470 tok)
- `settings.local.json` — Declares d (~2656 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## app/

- `globals.css` — Styles: 50 rules, 24 vars, 7 media queries, 5 animations (~6427 tok)
- `layout.tsx` — heebo (~718 tok)
- `manifest.ts` — Exports manifest (~233 tok)
- `page.tsx` — dynamic (~6170 tok)

## app/accessibility/

- `page.tsx` — metadata (~1436 tok)

## app/alignment/

- `page.tsx` — AlignmentPage (~71 tok)

## app/api/admin/create-user/

- `route.ts` — Next.js API route: POST (~358 tok)

## app/api/admin/delete-user/

- `route.ts` — Next.js API route: DELETE (~315 tok)

## app/api/admin/generate-invite/

- `route.ts` — Protected by ADMIN_SECRET header (~292 tok)

## app/api/auth/register-employee/

- `route.ts` — Next.js API route: POST (~543 tok)

## app/api/auth/send-reset/

- `route.ts` — Next.js API route: POST (~244 tok)

## app/api/dev-login/

- `route.ts` — DEV ONLY – auto-login without browser touching Supabase (~202 tok)

## app/api/drive/auth/

- `route.ts` — Next.js API route: GET (~226 tok)

## app/api/drive/callback/

- `route.ts` — Next.js API route: GET (~487 tok)

## app/api/drive/delete/

- `route.ts` — Next.js API route: DELETE (~307 tok)

## app/api/drive/disconnect/

- `route.ts` — Next.js API route: POST (~194 tok)

## app/api/drive/files/

- `route.ts` — Next.js API route: GET, POST (~1205 tok)

## app/api/drive/merge/

- `route.ts` — Next.js API route: POST (~352 tok)

## app/api/drive/status/

- `route.ts` — Next.js API route: GET (~199 tok)

## app/api/drive/upload/

- `route.ts` — Next.js API route: POST (~674 tok)

## app/api/employees/complete-registration/

- `route.ts` — Next.js API route: POST (~355 tok)

## app/api/employees/invite/

- `route.ts` — Next.js API route: POST (~386 tok)

## app/api/onboarding/complete/

- `route.ts` — Next.js API route: POST (~506 tok)

## app/api/public/customer-search/

- `route.ts` — Public route – no auth cookie needed. (~752 tok)

## app/api/public/plate/

- `route.ts` — Next.js API route: GET (~384 tok)

## app/api/store/

- `route.ts` — Next.js API route: GET, POST, PUT, PATCH, DELETE, OPTIONS (~571 tok)

## app/api/yard/barcode/

- `route.ts` — GET /api/yard/barcode?code=XXXXX — exact SKU match across tires and products (~494 tok)

## app/api/yard/receive/

- `route.ts` — POST /api/yard/receive (~730 tok)

## app/api/yard/search/

- `route.ts` — Next.js API route: GET (~1016 tok)

## app/api/yard/services/

- `route.ts` — GET /api/yard/services (~464 tok)

## app/api/yard/services/[id]/

- `route.ts` — PATCH /api/yard/services/[id] (~444 tok)

## app/api/yard/sessions/

- `route.ts` — GET /api/yard/sessions?status=active|pending_office|all (~547 tok)

## app/api/yard/sessions/[id]/

- `route.ts` — GET /api/yard/sessions/[id] (~974 tok)

## app/api/yard/sessions/[id]/items/

- `route.ts` — POST /api/yard/sessions/[id]/items — add one item or a batch of items (~580 tok)

## app/api/yard/sessions/[id]/items/[itemId]/

- `route.ts` — DELETE /api/yard/sessions/[id]/items/[itemId] (~549 tok)

## app/api/yard/vehicle-history/

- `route.ts` — GET /api/yard/vehicle-history?plate=1234567 (~299 tok)

## app/auth/callback/

- `page.tsx` — Auth callback – handles both implicit flow (hash tokens) and PKCE (code param). (~573 tok)

## app/billing/

- `page.tsx` — BillingPage (~68 tok)

## app/cars/

- `page.tsx` — CarsPage (~64 tok)

## app/dashboard/

- `page.tsx` — DashboardPage (~1031 tok)

## app/debts/

- `page.tsx` — DebtsPage (~66 tok)

## app/documents/

- `page.tsx` — DocumentsPage (~64 tok)

## app/employees/

- `page.tsx` — EmployeesPage (~71 tok)

## app/expenses/

- `page.tsx` — ExpensesPage (~67 tok)

## app/income/

- `page.tsx` — IncomePage (~66 tok)

## app/inspections/

- `page.tsx` — InspectionsPage (~74 tok)

## app/login/

- `actions.ts` — Exports loginAction (~117 tok)
- `page.tsx` — LoginPage — renders form — uses useRouter, useState, useEffect (~2877 tok)

## app/my-profile/

- `page.tsx` — labelSt — uses useRef, useState, useEffect (~2961 tok)

## app/onboarding/

- `page.tsx` — STEPS — uses useRouter, useState (~2136 tok)

## app/privacy/

- `page.tsx` — dynamic (~2000 tok)

## app/products/

- `page.tsx` — ProductsPage (~70 tok)

## app/quotes/

- `page.tsx` — QuotesPage (~67 tok)

## app/register/

- `page.tsx` — RegisterForm — renders form — uses useRouter, useSearchParams, useState, useEffect (~1855 tok)

## app/reminders/

- `page.tsx` — RemindersPage (~64 tok)

## app/reset-password/

- `page.tsx` — ResetPasswordPage — renders form — uses useRouter, useState, useEffect (~2066 tok)

## app/scan/

- `page.tsx` — metadata (~48 tok)

## app/set-password/

- `page.tsx` — SetPasswordPage — renders form — uses useRouter, useState, useEffect (~1051 tok)

## app/settings/

- `page.tsx` — SettingsPage (~70 tok)

## app/suppliers/

- `page.tsx` — SuppliersPage (~71 tok)

## app/terms/

- `page.tsx` — dynamic (~1817 tok)

## app/test-transfer/

- `page.tsx` — TestTransferPage (~73 tok)

## app/tires/

- `page.tsx` — TiresPage (~58 tok)

## app/tires/inventory-count/

- `page.tsx` — metadata (~81 tok)

## app/track/[token]/

- `page.tsx` — dynamic (~408 tok)
- `TrackView.tsx` — ALIGNMENT_STEPS — renders form — uses useState (~4893 tok)

## app/ui-demo/

- `page.tsx` — UiDemo — renders modal — uses useState (~1990 tok)

## app/yard-office/

- `layout.tsx` — metadata (~188 tok)
- `page.tsx` — YardOfficePage (~302 tok)

## app/yard/

- `layout.tsx` — metadata (~301 tok)
- `page.tsx` — dynamic (~236 tok)

## app/yard/[id]/

- `page.tsx` — WorkCardPage (~309 tok)

## app/yard/[id]/search/

- `page.tsx` — SearchPage (~293 tok)

## app/yard/[id]/service/

- `page.tsx` — ServicePage (~366 tok)

## app/yard/[id]/tire/

- `page.tsx` — TirePage (~227 tok)

## app/yard/new/

- `page.tsx` — NewCarPage (~87 tok)

## app/yard/receive/

- `page.tsx` — ReceivePage (~38 tok)

## components/alignment/

- `AlignmentClient.tsx` — STATUSES (~8745 tok)

## components/billing/

- `BillingClient.tsx` — fmt (~18970 tok)

## components/cars/

- `CarsClient.tsx` — CONDITIONS (~29318 tok)

## components/dashboard/

- `AlertsPanel.tsx` — fmt — uses useState, useRef, useEffect (~4023 tok)
- `DashboardCharts.tsx` — toMonthStr (~3368 tok)
- `DashboardStats.tsx` — DEFAULT_LAYOUT (~7951 tok)
- `ModuleGrid.tsx` — INITIAL_GROUPS — uses useRef, useEffect, useState (~4328 tok)
- `RemindersPanel.tsx` — useIsMobile — uses useState, useEffect (~3205 tok)

## components/debts/

- `DebtsClient.tsx` — fmt (~16998 tok)

## components/documents/

- `DocumentsClient.tsx` — emptyForm — renders table (~18852 tok)

## components/employees/

- `EmployeesClient.tsx` — Convert "MM/YYYY" → "YYYY-MM" for date comparisons (~18532 tok)

## components/expenses/

- `ExpensesClient.tsx` — DEFAULT_EXPENSE_CATS (~19039 tok)
- `RecurringTab.tsx` — EXPENSE_CATS — renders table, modal — uses useState (~3516 tok)
- `ScheduledPaymentsModal.tsx` — fmt — renders table, modal — uses useState, useCallback, useEffect (~5760 tok)

## components/inspections/

- `InspectionChecklistModal.tsx` — INSPECTION_SYSTEMS (~12236 tok)
- `InspectionsClient.tsx` — emptyForm (~15692 tok)

## components/landing/

- `CarsForSale.tsx` — driveThumb — uses useState, useCallback, useEffect (~4934 tok)
- `CustomerSearch.tsx` — Format raw digits as Israeli plate: 7→XX-XXX-XX, 8→XXX-XX-XXX (~3129 tok)
- `FaqAccordion.tsx` — FaqAccordion (~834 tok)
- `PriceList.tsx` — PriceList (~944 tok)
- `PromotionsCarousel.tsx` — PromotionsCarousel — uses useState, useCallback, useEffect (~2000 tok)

## components/layout/

- `AppShell.tsx` — AppShell (~312 tok)
- `Footer.tsx` — Footer (~378 tok)
- `Header.tsx` — HEB_ONES (~9463 tok)
- `Sidebar.tsx` — NAV_ITEMS (~5036 tok)
- `SidebarLayoutEditor.tsx` — SIDEBAR_LAYOUT_KEY — uses useEffect (~2777 tok)

## components/products/

- `ProductsClient.tsx` — UNITS (~16382 tok)

## components/quotes/

- `QuotesClient.tsx` — WIDTHS (~16720 tok)

## components/reminders/

- `RemindersClient.tsx` — PRIORITY_LABEL — renders form, modal (~7098 tok)

## components/scan/

- `ScanClient.tsx` — LOAD_INDICES (~12692 tok)

## components/settings/

- `SettingsClient.tsx` — ALL_MODULES (~30241 tok)

## components/suppliers/

- `SuppliersClient.tsx` — ISRAELI_BANKS (~9964 tok)

## components/test-transfer/

- `TestTransferClient.tsx` — ALL_STATUSES (~10668 tok)

## components/tires/

- `InventoryCountClient.tsx` — tireSize (~7588 tok)
- `TiresClient.tsx` — WIDTHS — renders table (~18723 tok)

## components/ui/

- `Badge.tsx` — COLORS (~267 tok)
- `Button.tsx` — VARIANTS — uses useState (~1037 tok)
- `Card.tsx` — Card (~145 tok)
- `ConfirmDialog.tsx` — ConfirmContext — uses useContext, useCallback (~898 tok)
- `DocumentScannerModal.tsx` — DocumentScannerModal — uses useState, useCallback, useEffect (~4388 tok)
- `EmptyState.tsx` — EmptyState (~297 tok)
- `ExcelMenu.tsx` — Single dropdown button for Excel export/import. (~724 tok)
- `Input.tsx` — Input (~681 tok)
- `Modal.tsx` — Modal — uses useEffect (~761 tok)
- `PageHeader.tsx` — PageHeader (~399 tok)
- `PlateInput.tsx` — FIELD_LABELS — uses useState (~968 tok)
- `RouteProgress.tsx` — RouteProgress — uses useRef, useEffect (~344 tok)
- `StatCard.tsx` — COLORS (~248 tok)
- `Toast.tsx` — ToastContext — uses useContext, useCallback (~896 tok)

## components/yard/

- `CameraScanner.tsx` — CameraScanner — uses useRef, useEffect (~1476 tok)
- `FreeSearchClient.tsx` — TYPE_LABEL — uses useRouter, useState, useCallback, useEffect (~4749 tok)
- `HebrewNumKeyboard.tsx` — HEB_ROWS (~782 tok)
- `KeyboardDismiss.tsx` — KeyboardDismiss — uses useState, useEffect (~359 tok)
- `NewCarClient.tsx` — NewCarClient — uses useRouter, useState, useRef, useCallback (~2164 tok)
- `OfficeClient.tsx` — VAT (~10860 tok)
- `ReceiveClient.tsx` — emptyTireForm (~6788 tok)
- `ServiceGridClient.tsx` — ServiceGridClient — uses useRouter, useState (~1613 tok)
- `TireDiagram.tsx` — TIRE_RECTS (~1299 tok)
- `TireKeyboard.tsx` — ROWS (~968 tok)
- `TirePositionPicker.tsx` — NAMES (~2468 tok)
- `TireSearchClient.tsx` — normalizeTireSize (~4015 tok)
- `VehicleHistoryModal.tsx` — POS_NAMES — uses useState, useEffect (~1693 tok)
- `WorkCardClient.tsx` — WorkCardClient (~9838 tok)
- `YardDashboard.tsx` — YardDashboard — uses useRouter, useState, useEffect (~1744 tok)

## lib/

- `drive.ts` — Google Drive API v3 helpers (server-side only) (~2913 tok)
- `uiSettings.ts` — Read ui_settings from the current user's tenant (~387 tok)
- `version.json` (~8 tok)

## lib/auth/

- `require.ts` — Server-side auth check for API routes. (~568 tok)
- `yard-token.ts` — Exports getYardTenantId (~28 tok)

## lib/contexts/

- `ProfileContext.tsx` — ProfileProvider/useProfile — fetches session+profile+full tenant row ONCE per page, shared by Header/Sidebar/all *Client components instead of each refetching (~662 tok)

## lib/hooks/

- `useIsMobile.ts` — Returns true only on touch devices (phones/tablets). Avoids SSR mismatch. (~90 tok)
- `usePlateSearch.ts` — Exports usePlateSearch (~377 tok)

## lib/supabase/

- `client.ts` — Exports createClient (~297 tok)
- `server.ts` — Exports createClient (~202 tok)
- `service.ts` — Service-role client – bypasses RLS. Use only in server-side code. (~81 tok)

## lib/utils/

- `plateApi.ts` — Israel data.gov.il vehicle API (~953 tok)

## lib/yard/

- `types.ts` — Exports TirePosition, YardSessionItem, YardSession, YardService + 5 more (~609 tok)

## public/

- `yard-manifest.json` (~135 tok)
- `yard-office-manifest.json` (~141 tok)

## scripts/

- `bump-version.js` — bump-version.js (~180 tok)

## supabase/migrations/

- `001_auth.sql` — AutoFlow – Migration 001: Tenants + Profiles (~482 tok)
- `002_registration_tokens.sql` — AutoFlow – Migration 002: Registration Tokens (~231 tok)
- `003_all_tables.sql` — AutoFlow – Migration 003: All Module Tables (~2339 tok)
- `004_recurring_expenses.sql` — AutoFlow – Migration 004: Recurring Expenses (~294 tok)
- `005_scheduled_payments_categories.sql` — AutoFlow – Migration 005: Scheduled Payments & Dynamic Categories (~762 tok)
- `006_supplier_debt_invoices.sql` — Add invoice/karteset support to supplier_debts (~93 tok)
- `007_employees_salaries.sql` — AutoFlow – Migration 007: Employees & Salaries Upgrade (~567 tok)
- `008_employee_payment_day.sql` — AutoFlow – Migration 008: Employee Payment Day (~125 tok)
- `009_employee_dates.sql` — AutoFlow – Migration 009: Employee Start & End Dates (~89 tok)
- `010_products_fields.sql` — AutoFlow – Migration 010: Products extra fields + product_sales (~344 tok)
- `011_product_movement_type.sql` — AutoFlow – Migration 011: product_sales movement type (~89 tok)
- `012_cars_phase10.sql` — AutoFlow – Migration 012: Cars Phase 10 (~653 tok)
- `013_tires.sql` — AutoFlow – Migration 013: Tires (Phase 9) (~486 tok)
- `014_tires_alter.sql` — AutoFlow – Migration 014: Fix tires table (align with Phase 9) (~426 tok)
- `015_cars_reserved_for.sql` — AutoFlow – Migration 015: Cars reserved_for field (~74 tok)
- `016_quotes_alter.sql` — AutoFlow – Migration 016: Extend quotes table for Phase 11 (~492 tok)
- `017_car_sale_requests.sql` — AutoFlow – Migration 017: Car sale requests (~337 tok)
- `018_car_sale_requests_fields.sql` — AutoFlow – Migration 018: Car sale requests extra fields (~110 tok)
- `019_alignment.sql` — Phase 12: Alignment jobs (פרונט / כיוון צירים) (~448 tok)
- `020_inspections.sql` — Phase 13: Car purchase inspections (בדיקות קניה) (~402 tok)
- `021_reminders_alter.sql` — Phase 15: Reminders – add category & notes fields (~48 tok)
- `022_documents_alter.sql` — Phase 16: Documents – add icon field, keep content jsonb for all template data (~135 tok)
- `023_reminders_tasks.sql` — Phase 15: Reminders & Tasks – add type, status, phone, due_time (~136 tok)
- `024_billing_accounts.sql` — Phase 17: Billing Accounts (~821 tok)
- `025_billing_contacts.sql` — Phase 17b: Billing Contacts (~319 tok)
- `026_vault.sql` — Phase 18b: Password Vault (~196 tok)
- `027_employee_invite.sql` — Add employee invite support to registration_tokens (~82 tok)
- `028_landing_tables.sql` — ══════════════════════════════════════════════════════════════════════════ (~1016 tok)
- `029_tenant_public_info.sql` — ══════════════════════════════════════════════════════════════════════════ (~174 tok)
- `030_supplier_bank_salary_unique.sql` — ══════════════════════════════════════════════════════════════════════════ (~235 tok)
- `031_services_image.sql` — ══════════════════════════════════════════════════════════════════════════ (~75 tok)
- `032_employee_self_edit.sql` — ══════════════════════════════════════════════════════════════════════════ (~300 tok)
- `033_registration_tokens_rls.sql` — ══════════════════════════════════════════════════════════════════════════ (~289 tok)
- `034_super_admin.sql` — ══════════════════════════════════════════════════════════════════════════ (~162 tok)
- `035_fix_profiles_rls.sql` — ══════════════════════════════════════════════════════════════════════════ (~222 tok)
- `036_inspection_car_code.sql` — Add car_code field to car_inspections (internal reference code) (~39 tok)
- `037_tires_supplier.sql` — Add supplier reference to tires (~40 tok)
- `038_supplier_category.sql` — Add category field to suppliers (~28 tok)
- `039_tenant_drive.sql` — Google Drive integration per tenant (~52 tok)
- `040_inspection_drive_file.sql` — SQL: 1 alter(s) (~21 tok)
- `041_supplier_categories_table.sql` — Supplier categories table (per-tenant, dynamic) (~209 tok)
- `042_ui_settings.sql` — ui_settings: stores per-tenant UI preferences (sidebar layout, dashboard layout) (~48 tok)
- `043_promotions_fine_print.sql` — SQL: 1 alter(s) (~19 tok)
- `044_faq.sql` — SQL: tables: faq, 1 alter(s) (~220 tok)
- `045_alignment_work_order.sql` — 045 · Alignment work order fields (~181 tok)
- `046_test_transfers.sql` — Migration 046: test_transfers (~475 tok)
- `047_test_transfer_track_token.sql` — Migration 047: add track_token to test_transfers for public status tracking (~146 tok)
- `048_inspection_time.sql` — SQL: 1 alter(s) (~19 tok)
- `049_engine_cc_text.sql` — SQL: 1 alter(s) (~24 tok)
- `050_inspection_number.sql` — SQL: 1 alter(s) (~59 tok)
- `051_tires_condition.sql` — AutoFlow – Migration 051: Add condition column to tires (~92 tok)
- `052_yard.sql` — ════════════════════════════════════════════ (~1005 tok)
- `053_yard_rpcs.sql` — RPC: decrement tire quantity on yard session close (~160 tok)
- `054_tire_position.sql` — Add tire position tracking to yard session items (~52 tok)
- `055_quotes_part_items.sql` — SQL: 1 alter(s) (~22 tok)
- `056_fix_tenant_name_space.sql` — Fix tenant name: replace 'אוטוליין' (no space) with 'אוטו ליין' (with space) (~41 tok)
- `057_tire_type.sql` — AutoFlow – Migration 057: Add tire_type to tires + current_location to cars (~84 tok)
- `058_inventory_count.sql` — AutoFlow – Migration 058: Tire Inventory Count Sessions (~420 tok)
- `059_car_requests_fields.sql` — Add transmission and max_hand to car_requests (~50 tok)
- `060_products_barcode.sql` — Add barcode field to products (separate from sku/מק"ט) (~32 tok)

## tests/

- `accessibility.spec.ts` — Declares title (~752 tok)
- `auth.spec.ts` — Declares SB_URL (~950 tok)
- `forms.spec.ts` — Declares label (~1171 tok)
- `navigation.spec.ts` — All app pages and their expected page title text (~818 tok)
- `responsive.spec.ts` — Mobile viewport – same as iPhone 13 (~852 tok)
- `search.spec.ts` — Declares SB_URL (~982 tok)

## tests/fixtures/

- `057_tire_type.sql` — Migration 057: tire_type (regular/reinforced/commercial) to tires + current_location to cars (~30 tok)
- `mock.ts` — Supabase project ref (from env) (~959 tok)
