import { test, expect } from '@playwright/test'
import { useEnglish } from './_support/e2e'

// Reads are served by the e2e Nitro layer (test/fixtures/e2e) under real SSR;
// ops is read-only so no page.route is needed. admin.dashboard.view comes from
// the default-full e2e principal.
test('ops page shows readiness + drill evidence', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/ops')

  await expect(page.getByTestId('ops-readiness')).toBeVisible()
  await expect(page.getByTestId('ops-readiness-status')).toContainText('Ready')
  await expect(page.getByTestId('ops-check-database')).toBeVisible()

  await expect(page.getByTestId('ops-drills')).toBeVisible()
  const runbook = page.getByTestId('ops-drill-runbook-jwks-rotation')
  await expect(runbook).toHaveAttribute('rel', /noopener/)
  await expect(runbook).toHaveAttribute('target', '_blank')
})
