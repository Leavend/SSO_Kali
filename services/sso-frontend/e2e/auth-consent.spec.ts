import { test, expect } from '@playwright/test'

/**
 * E2E — Consent page (UC-13: explicit OAuth consent decision).
 *
 * The consent route is intentionally not behind `requiresAuth` (the
 * backend itself enforces session via the consent endpoint). With no
 * client_id+state in the query, the page short-circuits and surfaces
 * the safe "permintaan tidak lengkap" copy on the auth shell. With an
 * unreachable backend, the same banner copy guards us against leaking
 * stack traces (TDD-standart-prod §13.3 / safeConsentErrorCopy).
 */

test.describe('Consent page', () => {
  test('renders incomplete-request banner when client_id/state missing', async ({ page }) => {
    await page.goto('/auth/consent')

    await expect(page.locator('#consent-title')).toBeVisible()
    await expect(
      page.getByText('Permintaan persetujuan tidak lengkap.', { exact: false }),
    ).toBeVisible()
  })

  test('keeps the same banner for partial query (only client_id)', async ({ page }) => {
    await page.goto('/auth/consent?client_id=demo')

    await expect(
      page.getByText('Permintaan persetujuan tidak lengkap.', { exact: false }),
    ).toBeVisible()
  })

  test('document title reflects the consent route meta', async ({ page }) => {
    await page.goto('/auth/consent')
    await expect(page).toHaveTitle(/Otorisasi Aplikasi/)
  })
})
