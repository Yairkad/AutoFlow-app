import { Page } from '@playwright/test'

// Supabase project ref (from env)
const SB_REF = 'ucvphucjkixhdnvzhvgf'
const SB_URL = `https://${SB_REF}.supabase.co`

// ── Fake user / tenant ────────────────────────────────────────────────────

export const FAKE_USER = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  email: 'test@autoflow.co.il',
  role: 'authenticated',
}
export const FAKE_TENANT_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

// ── Inject auth session into localStorage ─────────────────────────────────

export async function mockAuth(page: Page) {
  await page.addInitScript(({ ref, user, tenantId }) => {
    const session = {
      access_token:  'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_in:    3600,
      expires_at:    Math.floor(Date.now() / 1000) + 3600,
      token_type:    'bearer',
      user,
    }
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session))
    localStorage.setItem('tenant_id', tenantId)
  }, { ref: SB_REF, user: FAKE_USER, tenantId: FAKE_TENANT_ID })
}

// ── Intercept Supabase REST API ───────────────────────────────────────────

export async function mockSupabase(page: Page) {
  // Auth: getUser
  await page.route(`${SB_URL}/auth/v1/user`, route =>
    route.fulfill({ json: FAKE_USER })
  )

  // Auth: token refresh
  await page.route(`${SB_URL}/auth/v1/token*`, route =>
    route.fulfill({
      json: {
        access_token: 'fake-access-token',
        user: FAKE_USER,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    })
  )

  // profiles – returns current user profile
  await page.route(`${SB_URL}/rest/v1/profiles*`, route =>
    route.fulfill({
      json: [{
        id: FAKE_USER.id,
        tenant_id: FAKE_TENANT_ID,
        full_name: 'יאיר בדיקה',
        phone: '050-0000001',
        role: 'admin',
        allowed_modules: [],
        is_active: true,
      }],
    })
  )

  // tenants
  await page.route(`${SB_URL}/rest/v1/tenants*`, route =>
    route.fulfill({
      json: [{
        id: FAKE_TENANT_ID,
        name: 'מוסך בדיקה',
        sub_title: 'פנצריה ומוסך',
        phone: '04-0000000',
        address: 'רחוב הבדיקה 1',
        tax_id: '123456789',
        logo_base64: null,
      }],
    })
  )

  // All data tables → return empty arrays by default
  const EMPTY_TABLES = [
    'expenses', 'income', 'customer_debts', 'supplier_debts',
    'suppliers', 'employees', 'salaries', 'products', 'tires',
    'quotes', 'alignment_jobs', 'car_inspections', 'cars',
    'reminders', 'documents', 'billing_items', 'billing_entries',
    'billing_entry_payments', 'billing_contacts', 'registration_tokens',
    'recurring_expenses', 'scheduled_payments',
  ]
  for (const table of EMPTY_TABLES) {
    await page.route(`${SB_URL}/rest/v1/${table}*`, route => {
      // Allow POST/PATCH/DELETE to pass through as 200
      if (route.request().method() !== 'GET') {
        return route.fulfill({ status: 200, json: {} })
      }
      return route.fulfill({ json: [] })
    })
  }
}

// ── Combined setup ────────────────────────────────────────────────────────

export async function setupMocks(page: Page) {
  await mockAuth(page)
  await mockSupabase(page)
}
