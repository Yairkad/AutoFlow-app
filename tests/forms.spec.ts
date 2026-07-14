import { test, expect } from '@playwright/test'
import { setupMocks } from './fixtures/mock'

test.describe('טפסים – הוצאות', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/expenses')
  })

  test('כפתור "הוסף הוצאה" קיים', async ({ page }) => {
    await expect(page.locator('button', { hasText: /הוסף|הוצאה/ })).toBeVisible()
  })

  test('פתיחת modal הוספת הוצאה', async ({ page }) => {
    await page.locator('button', { hasText: /הוסף|הוצאה חד/ }).first().click()
    await expect(page.locator('[class*="modal"], [id*="modal"], dialog').first()).toBeVisible()
  })

  test('שמירת טופס ריק – לא שומר (validation)', async ({ page }) => {
    await page.locator('button', { hasText: /הוסף|הוצאה חד/ }).first().click()
    // Click save without filling required fields
    await page.locator('button', { hasText: /שמור|הוסף/ }).last().click()
    // Modal should stay open (not closed = save was blocked)
    await expect(page.locator('[class*="modal"], [id*="modal"], dialog').first()).toBeVisible()
  })
})

test.describe('טפסים – חובות', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/debts')
  })

  test('שני טאבים: לקוחות מזדמנים / העברות לאימות', async ({ page }) => {
    await expect(page.locator('button, [role="tab"]', { hasText: 'לקוחות מזדמנים' })).toBeVisible()
    await expect(page.locator('button, [role="tab"]', { hasText: 'העברות לאימות' })).toBeVisible()
  })

  test('כפתור הוספת חוב קיים', async ({ page }) => {
    await expect(page.locator('button', { hasText: /הוסף|חוב/ })).toBeVisible()
  })
})

test.describe('טפסים – עובדים', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/employees')
  })

  test('טאבים: עובדים / שכר', async ({ page }) => {
    await expect(page.locator('button, [role="tab"]', { hasText: 'עובדים' })).toBeVisible()
    await expect(page.locator('button, [role="tab"]', { hasText: 'שכר' })).toBeVisible()
  })
})

test.describe('טפסים – ספקים', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/suppliers')
  })

  test('כפתור הוספת ספק קיים', async ({ page }) => {
    await expect(page.locator('button', { hasText: /הוסף|ספק/ }).first()).toBeVisible()
  })
})

test.describe('טפסים – הצעות מחיר', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/quotes')
  })

  test('טאבים: צמיגים / חלקים', async ({ page }) => {
    await expect(page.locator('button, [role="tab"]', { hasText: 'צמיגים' })).toBeVisible()
    await expect(page.locator('button, [role="tab"]', { hasText: 'חלקים' })).toBeVisible()
  })
})

test.describe('טפסים – הגדרות', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/settings')
  })

  test('3 טאבים: פרטי עסק / משתמשים / הזמנת עובד', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'פרטי עסק' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'משתמשים' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'הזמנת עובד' })).toBeVisible()
  })

  test('טופס פרטי עסק מציג שדות', async ({ page }) => {
    await expect(page.locator('input[placeholder*="שם"]')).toBeVisible({ timeout: 6000 })
    await expect(page.locator('input[placeholder*="טלפון"]')).toBeVisible()
  })

  test('מעבר לטאב הזמנת עובד', async ({ page }) => {
    await page.locator('button', { hasText: 'הזמנת עובד' }).click()
    await expect(page.locator('button', { hasText: /צור קישור/ })).toBeVisible()
  })
})

test.describe('טפסים – ספקים / לקוחות (מעקב + פרטים)', () => {
  test('/suppliers: טאבי מעקב ופרטים', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/suppliers')
    for (const label of ['📋 מעקב', '🏭 פרטים']) {
      await expect(page.locator(`button:has-text("${label}")`)).toBeVisible()
    }
  })

  test('/customers: טאבי מעקב ופרטים', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/customers')
    for (const label of ['📋 מעקב', '💳 פרטים']) {
      await expect(page.locator(`button:has-text("${label}")`)).toBeVisible()
    }
  })
})
