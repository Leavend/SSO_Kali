import { test, expect } from '@playwright/test'

test('renders the Vue canary control plane', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dev-SSO admin shell')
  await expect(page.getByRole('link', { name: 'Buka admin stabil' })).toBeVisible()
})
