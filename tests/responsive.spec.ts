import { test, expect } from '@playwright/test'
import { setupMocks } from './fixtures/mock'

// Mobile viewport – same as iPhone 13
const MOBILE = { width: 390, height: 844 }

test.describe('רספונסיביות – mobile', () => {
  test.use({ viewport: MOBILE })

  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test('header נראה ב-mobile', async ({ page }) => {
    await page.goto('/dashboard')
    const header = page.locator('header')
    await expect(header).toBeVisible()
    // Header should not overflow horizontally
    const headerBox = await header.boundingBox()
    expect(headerBox?.width).toBeLessThanOrEqual(MOBILE.width)
  })

  test('אין overflow אופקי בdashboard', async ({ page }) => {
    await page.goto('/dashboard')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 5) // 5px tolerance
  })

  test('הוצאות – אין overflow', async ({ page }) => {
    await page.goto('/expenses')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 5)
  })

  test('חובות – אין overflow', async ({ page }) => {
    await page.goto('/debts')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 5)
  })

  test('הגדרות – אין overflow', async ({ page }) => {
    await page.goto('/settings')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 5)
  })

  test('חשבונות – אין overflow', async ({ page }) => {
    await page.goto('/billing')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 5)
  })
})

test.describe('רספונסיביות – tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test('dashboard נטען ב-tablet', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('body')).toContainText('ראשי')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(768 + 5)
  })
})

test.describe('רספונסיביות – desktop (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  test('sidebar גלוי ב-desktop', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('aside')).toBeVisible()
  })

  test('header מלא גלוי ב-desktop', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('header')).toBeVisible()
    // Clock visible
    await expect(page.locator('header').locator('text=/\\d{2}:\\d{2}/')).toBeVisible()
  })
})
