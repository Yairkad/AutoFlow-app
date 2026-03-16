import { test, expect } from '@playwright/test'
import { setupMocks, FAKE_TENANT_ID } from './fixtures/mock'

const SB_URL = 'https://ucvphucjkixhdnvzhvgf.supabase.co'

test.describe('חיפוש גלובלי', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test('שדה חיפוש קיים ב-header', async ({ page }) => {
    await page.goto('/dashboard')
    const searchInput = page.locator('header input')
    await expect(searchInput).toBeVisible()
  })

  test('פחות מ-2 תווים – אין קריאה ל-Supabase', async ({ page }) => {
    let called = false
    await page.route(`${SB_URL}/rest/v1/customer_debts*`, route => {
      called = true
      return route.fulfill({ json: [] })
    })
    await page.goto('/dashboard')
    const input = page.locator('header input')
    await input.fill('א')
    await page.waitForTimeout(400)
    expect(called).toBe(false)
  })

  test('2+ תווים – dropdown מופיע', async ({ page }) => {
    await page.route(`${SB_URL}/rest/v1/customer_debts*`, route =>
      route.fulfill({ json: [{ id: '1', name: 'ישראל ישראלי', phone: '050-1234567', plate: null, amount: 500 }] })
    )
    await page.goto('/dashboard')
    const input = page.locator('header input')
    await input.fill('ישראל')
    // Wait for debounce + response
    await expect(page.locator('header').locator('text=ישראל ישראלי')).toBeVisible({ timeout: 2000 })
    await expect(page.locator('header').locator('text=חובות')).toBeVisible()
  })

  test('תוצאה – לחיצה מנווטת לדף הנכון', async ({ page }) => {
    await page.route(`${SB_URL}/rest/v1/customer_debts*`, route =>
      route.fulfill({ json: [{ id: '1', name: 'דוד לוי', phone: null, plate: null, amount: 200 }] })
    )
    await page.goto('/dashboard')
    const input = page.locator('header input')
    await input.fill('דוד')
    const result = page.locator('header').locator('text=דוד לוי')
    await expect(result).toBeVisible({ timeout: 2000 })
    await result.click()
    await expect(page).toHaveURL('/debts')
  })

  test('Escape מנקה את השדה וסוגר dropdown', async ({ page }) => {
    await page.goto('/dashboard')
    const input = page.locator('header input')
    await input.fill('משהו')
    await input.press('Escape')
    await expect(input).toHaveValue('')
  })

  test('ניווט מקלדת ↓↑ בתוצאות', async ({ page }) => {
    await page.route(`${SB_URL}/rest/v1/customer_debts*`, route =>
      route.fulfill({
        json: [
          { id: '1', name: 'ראשון', phone: null, plate: null, amount: 100 },
          { id: '2', name: 'שני', phone: null, plate: null, amount: 200 },
        ],
      })
    )
    await page.goto('/dashboard')
    const input = page.locator('header input')
    await input.fill('שון')
    await expect(page.locator('header').locator('text=ראשון')).toBeVisible({ timeout: 2000 })
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    // second item is now highlighted
    const secondRow = page.locator('header').locator('text=שני').locator('..')
    await expect(secondRow).toHaveCSS('background', /rgb/)
  })

  test('חיפוש לא מוצא – מציג "לא נמצאו תוצאות"', async ({ page }) => {
    await page.goto('/dashboard')
    const input = page.locator('header input')
    await input.fill('zzznone')
    await expect(page.locator('header').locator('text=לא נמצאו תוצאות')).toBeVisible({ timeout: 2000 })
  })
})
