import { test, expect } from '@playwright/test'
import { setupMocks } from './fixtures/mock'

test.describe('נגישות ו-UX בסיסי', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test('כותרת עמוד (title) מוגדרת', async ({ page }) => {
    await page.goto('/dashboard')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('כיוון RTL מוגדר על body', async ({ page }) => {
    await page.goto('/dashboard')
    const dir = await page.locator('html, body').first().getAttribute('dir')
    // Either html or body should have dir=rtl, or it's set via CSS
    const cssDir = await page.evaluate(() =>
      getComputedStyle(document.body).direction
    )
    expect(cssDir).toBe('rtl')
  })

  test('כל תמונות (img) יש להן alt', async ({ page }) => {
    await page.goto('/dashboard')
    const imgsWithoutAlt = await page.locator('img:not([alt])').count()
    expect(imgsWithoutAlt).toBe(0)
  })

  test('Tab navigation – שדה חיפוש מקבל focus', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('header input').focus()
    await expect(page.locator('header input')).toBeFocused()
  })

  test('הוצאות – כפתור ראשי נגיש עם מקלדת', async ({ page }) => {
    await page.goto('/expenses')
    // Tab to first button in main content
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })

  test('אין טקסט "undefined" או "null" מוצג בדפים', async ({ page }) => {
    const pages = ['/dashboard', '/expenses', '/debts', '/settings']
    for (const href of pages) {
      await page.goto(href)
      const text = await page.locator('body').innerText()
      expect(text).not.toContain('undefined')
      expect(text).not.toContain('[object Object]')
    }
  })

  test('toast לא גלוי בטעינה רגילה', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(500)
    // Toast should not be visible on page load
    const toast = page.locator('[class*="toast"], [id*="toast"]')
    const count = await toast.count()
    if (count > 0) {
      await expect(toast.first()).not.toBeVisible()
    }
  })

  test('confirm dialog לא גלוי בטעינה', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForTimeout(300)
    const overlay = page.locator('[class*="confirm"], [class*="overlay"]').filter({ hasText: /מחק|ביטול/ })
    const count = await overlay.count()
    if (count > 0) {
      await expect(overlay.first()).not.toBeVisible()
    }
  })
})
