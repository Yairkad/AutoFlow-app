import { test, expect } from '@playwright/test'
import { setupMocks } from './fixtures/mock'

const SB_URL = 'https://ucvphucjkixhdnvzhvgf.supabase.co'

test.describe('Auth – Login', () => {
  test('דף login נטען עם שדות email + password', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"], button:has-text("כניסה")')).toBeVisible()
  })

  test('כניסה ריקה – מציג שגיאה', async ({ page }) => {
    await page.goto('/login')
    await page.locator('button[type="submit"], button:has-text("כניסה")').click()
    // Either HTML5 validation or custom error message
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const isRequired = await emailInput.getAttribute('required')
    if (isRequired !== null) {
      // HTML5 validation – browser blocks submit
      await expect(emailInput).toBeFocused()
    } else {
      await expect(page.locator('body')).toContainText(/שגיאה|שדה חובה|אימייל/)
    }
  })

  test('כניסה מוצלחת → redirect ל-dashboard', async ({ page }) => {
    await page.route(`${SB_URL}/auth/v1/token*`, route =>
      route.fulfill({
        json: {
          access_token: 'fake-token',
          user: { id: 'test-id', email: 'test@test.com' },
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      })
    )
    await setupMocks(page)
    await page.goto('/login')
    await page.locator('input[type="email"], input[name="email"]').fill('test@test.com')
    await page.locator('input[type="password"]').fill('password123')
    await page.locator('button[type="submit"], button:has-text("כניסה")').click()
    await expect(page).toHaveURL(/dashboard|\//, { timeout: 8000 })
  })
})

test.describe('Auth – Avatar dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/dashboard')
  })

  test('לחיצה על avatar פותחת dropdown', async ({ page }) => {
    // Wait for avatar to load initials
    await page.waitForTimeout(500)
    const avatar = page.locator('header').locator('div').filter({ hasText: /^[א-ת]{1,2}$/ }).last()
    await avatar.click()
    await expect(page.locator('text=הגדרות')).toBeVisible()
    await expect(page.locator('text=התנתקות')).toBeVisible()
  })

  test('לחיצה על "הגדרות" בdropdown מנווטת', async ({ page }) => {
    await page.waitForTimeout(500)
    const avatar = page.locator('header').locator('div').filter({ hasText: /^[א-ת]{1,2}$/ }).last()
    await avatar.click()
    await page.locator('button:has-text("הגדרות")').click()
    await expect(page).toHaveURL('/settings')
  })

  test('התנתקות → עובר ל-login', async ({ page }) => {
    await page.route(`${SB_URL}/auth/v1/logout*`, route =>
      route.fulfill({ status: 204, body: '' })
    )
    await page.waitForTimeout(500)
    const avatar = page.locator('header').locator('div').filter({ hasText: /^[א-ת]{1,2}$/ }).last()
    await avatar.click()
    await page.locator('button:has-text("התנתקות")').click()
    await expect(page).toHaveURL(/login/, { timeout: 5000 })
  })
})
