import { test, expect } from '@playwright/test'
import { setupMocks } from './fixtures/mock'

// All app pages and their expected page title text
const PAGES = [
  { href: '/dashboard',   title: 'ראשי' },
  { href: '/expenses',    title: 'הוצאות' },
  { href: '/debts',       title: 'חובות' },
  { href: '/employees',   title: 'עובדים' },
  { href: '/products',    title: 'מוצרים' },
  { href: '/tires',       title: 'צמיגים' },
  { href: '/cars',        title: 'רכבים' },
  { href: '/quotes',      title: 'הצעות' },
  { href: '/suppliers',   title: 'ספקים' },
  { href: '/alignment',   title: 'פרונט' },
  { href: '/inspections', title: 'בדיקות' },
  { href: '/reminders',   title: 'תזכורות' },
  { href: '/documents',   title: 'מסמכים' },
  { href: '/billing',     title: 'חשבונות' },
  { href: '/settings',    title: 'הגדרות' },
]

test.describe('ניווט – כל הדפים נטענים', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
  })

  for (const { href, title } of PAGES) {
    test(`${href} נטען ומציג "${title}"`, async ({ page }) => {
      await page.goto(href)
      await expect(page).not.toHaveURL('/login')
      // Page should not show error boundaries
      await expect(page.locator('body')).not.toContainText('Application error')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      // Contains the module title somewhere
      await expect(page.locator('body')).toContainText(title, { timeout: 8000 })
    })
  }

  test('sidebar קיים ומציג קישורים', async ({ page }) => {
    await page.goto('/dashboard')
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.locator('a')).toHaveCount(PAGES.length)
  })

  test('header מציג שם עסק ושעון', async ({ page }) => {
    await page.goto('/dashboard')
    const header = page.locator('header')
    await expect(header).toBeVisible()
    await expect(header).toContainText('AutoFlow')
    // Clock digits
    await expect(header.locator('text=/\\d{2}:\\d{2}:\\d{2}/')).toBeVisible()
  })

  test('header מציג אותיות avatar של המשתמש', async ({ page }) => {
    await page.goto('/dashboard')
    // "יאיר בדיקה" → initials "יב"
    await expect(page.locator('header')).toContainText('יב', { timeout: 5000 })
  })

  test('ניווט דרך sidebar – מעביר לדף הנכון', async ({ page }) => {
    await page.goto('/dashboard')
    await page.locator('aside a[href="/expenses"]').click()
    await expect(page).toHaveURL('/expenses')
    await expect(page.locator('body')).toContainText('הוצאות')
  })
})

test.describe('ניווט – Login redirect', () => {
  test('מנותק → מועבר ל-login', async ({ page }) => {
    // No mocks – no auth session
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/login/)
  })
})
