import { test, expect } from '@playwright/test'

test('renders the forbidden page without an admin session', async ({ page }) => {
  await page.goto('/forbidden')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Akun ini belum memiliki akses admin',
  )
  await expect(page.getByRole('link', { name: 'Kembali ke Portal SSO' })).toBeVisible()
})
