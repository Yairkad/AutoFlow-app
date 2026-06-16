# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-27

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->
- **Salary model (2026-06-03):** Salary tab uses simple monthly net-entry model. No hourly/monthly type distinction. Each month user enters the net payslip amount directly (stored in `salaries.base`). External bonuses/deductions stored in `additions`/`deductions` JSONB. `total = base + additions - deductions`. Employee profile has no salary reference field.

## Key Learnings

- **Project:** autoline-app
- **Description:** This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
- **Role check pattern:** `isAdmin = profile.role === 'admin' || profile.role === 'super_admin'`. Non-admin employees should NOT see: AlertsPanel, RemindersPanel (dashboard), movements tab in Tires. Employee view in /employees shows only a phone-book (no salary data).
- **Tires permissions:** `isAdmin` controls access to the movements tab. `viewOnly` = has `tires_view` module but not `tires` and not admin (read-only inventory). Employees with neither module see nothing.
- **Shared profile/tenant context (2026-06-16):** `lib/contexts/ProfileContext.tsx` (`ProfileProvider`/`useProfile()`) fetches session+profile+full tenant row ONCE per page load. It's wired into `AppShell` (wraps Header, Sidebar, and the page's children). Any component rendered as a descendant of `AppShell` should use `useProfile()` instead of querying `auth.getUser()`/`profiles`/`tenants` itself — every `*Client.tsx` component, Header, Sidebar, and DashboardStats/Charts already do this. `profile.tenant` holds the full tenants row (all columns) so consumers needing business info (name/phone/address/logo/license_number/tax_id for invoices etc.) read it off `profile.tenant` instead of querying tenants again.
- **AppShell/Provider tree gotcha:** `useProfile()` only works in components rendered as JSX *children* of `<AppShell>`. A component that wraps itself in `<AppShell>...</AppShell>` in its own return statement (rather than being passed as AppShell's children from its page.tsx) CANNOT call `useProfile()` at its own top level — the Provider is a descendant of that component, not an ancestor, so context resolves to the default (null/loading forever). Fix: split into an outer wrapper (does the `<AppShell>` wrapping, no hooks needed) and an inner component (calls `useProfile()`, rendered as AppShell's child). This bit `ExpensesClient.tsx` and `app/dashboard/page.tsx` — both fixed by extracting an inner content component.

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
