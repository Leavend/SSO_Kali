import { test, expect } from '@playwright/test'
import { useEnglish } from './_support/e2e'

// SSR-served by the e2e Nitro layer (me.get.ts returns the full admin principal
// including profile.read permission). No page.route needed — read-only page.
test('profile page shows the admin identity + security posture', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/profile')

  await expect(page.getByTestId('profile-identity')).toBeVisible()
  await expect(page.getByTestId('profile-email')).toHaveText('admin@dev-sso.local')
  await expect(page.getByTestId('profile-security')).toBeVisible()
  await expect(page.getByTestId('profile-mfa-status')).toBeVisible()
  await expect(page.getByTestId('profile-permissions')).toBeVisible()
})
