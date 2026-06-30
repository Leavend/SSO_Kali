import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('profile page shows the admin identity + security posture', async ({ page, context }) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/profile')

  await expect(page.getByTestId('profile-identity')).toBeVisible()
  await expect(page.getByTestId('profile-security')).toBeVisible()
  await expect(page.getByTestId('profile-mfa-status')).toBeVisible()
  await expect(page.getByTestId('profile-permissions')).toBeVisible()
})
