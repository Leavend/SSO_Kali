import { test, expect } from '@playwright/test'

// layout:false public pages — no auth layer, no locale dependency.
// Locale setup dropped: both pages use hardcoded English copy.

test('renders the forbidden page', async ({ page }) => {
  await page.goto('/forbidden')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Access denied')
})

test('renders the admin error page', async ({ page }) => {
  await page.goto('/admin-error')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Something went wrong')
})
