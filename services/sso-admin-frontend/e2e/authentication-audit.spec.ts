import { test, expect } from '@playwright/test'
import { useEnglish } from './_support/e2e'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('authentication-audit page lists events, filters, and opens a detail drawer', async ({
  page,
}) => {
  await useEnglish(page)
  await page.goto('/authentication-audit')

  await expect(page.getByTestId('auth-audit-filter-form')).toBeVisible()
  const firstRow = page.locator('[data-testid^="auth-audit-select-"]').first()
  await expect(firstRow).toBeVisible()
  await firstRow.click()
  await expect(page.getByTestId('auth-audit-detail')).toBeVisible()
})
