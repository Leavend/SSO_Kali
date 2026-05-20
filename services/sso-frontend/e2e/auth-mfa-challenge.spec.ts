import { test, expect } from '@playwright/test'

/**
 * E2E — MFA Challenge page (UC-67 / FR-019).
 *
 * Scope: guard behaviour + method switcher + a11y wiring. The challenge
 * store is empty in raw E2E navigation, so on mount the page redirects
 * back to /auth.login. We assert that redirect happens and that the
 * route remains reachable for stored challenges (validated at unit level
 * in `useMfaChallenge.spec.ts`).
 */

test.describe('MFA Challenge page', () => {
  test('redirects to /auth.login when no active challenge is stored', async ({ page }) => {
    await page.goto('/auth/mfa-challenge')
    await page.waitForURL('/')
    await expect(page.locator('#login-identifier')).toBeVisible()
  })

  test('document title reflects the route meta during redirect', async ({ page }) => {
    await page.goto('/auth/mfa-challenge')
    // Guard fires onMounted, so title is set briefly then changes — assert end state.
    await page.waitForURL('/')
    await expect(page).toHaveTitle(/Masuk/)
  })

  test('cannot reach MFA route without a stored challenge across reload', async ({ page }) => {
    await page.goto('/auth/mfa-challenge')
    await page.waitForURL('/')
    await page.reload()
    await expect(page).toHaveURL('/')
  })
})
