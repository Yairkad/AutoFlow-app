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

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
