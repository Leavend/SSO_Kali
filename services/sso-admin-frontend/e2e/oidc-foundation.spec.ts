import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('oidc-foundation page shows the protocol-health panels', async ({ page, context }) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/oidc-foundation')

  await expect(page.getByTestId('oidc-discovery')).toBeVisible()
  await expect(page.getByTestId('oidc-jwks')).toBeVisible()
  await expect(page.getByTestId('oidc-availability')).toBeVisible()
  await expect(page.getByTestId('oidc-consistency')).toBeVisible()
  await expect(page.getByTestId('oidc-catalog')).toBeVisible()
})
