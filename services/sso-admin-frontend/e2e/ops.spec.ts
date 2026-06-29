import { test, expect } from '@playwright/test'

// DEFERRED to Phase 18 cutover: playwright.config.ts is still legacy-SPA-wired
// (ports 5173/4173, no Nuxt build:web; Nuxt serves on 3000). Authored now against
// the shipped Nuxt routes so it becomes a real gate at cutover. Do NOT run as a
// gate this phase.
test('ops page shows readiness + drill evidence', async ({ page, context }) => {
  await context.addCookies([
    { name: 'admin_locale', value: 'en', url: 'http://localhost:3000' },
  ])
  await page.goto('/ops')

  await expect(page.getByTestId('ops-readiness')).toBeVisible()
  await expect(page.getByTestId('ops-readiness-status')).toContainText('Ready')
  await expect(page.getByTestId('ops-check-database')).toBeVisible()

  await expect(page.getByTestId('ops-drills')).toBeVisible()
  const runbook = page.getByTestId('ops-drill-runbook-jwks-rotation')
  await expect(runbook).toHaveAttribute('rel', /noopener/)
  await expect(runbook).toHaveAttribute('target', '_blank')
})
