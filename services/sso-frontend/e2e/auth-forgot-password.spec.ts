import { test, expect } from '@playwright/test'

/**
 * E2E — Forgot Password page (UC: password reset request).
 *
 * Scope: route reachability + form/skip-link/a11y wiring + back link.
 * Backend is intentionally not exercised here (anti-enumeration response
 * is covered by `usePasswordLifecycle.spec.ts` at unit level). Keeping
 * E2E offline-friendly so CI and local runs converge without seeded users.
 */

test.describe('Forgot Password page', () => {
  test('renders headline, email pill, and submit CTA', async ({ page }) => {
    await page.goto('/auth/forgot-password')

    await expect(page.locator('#forgot-title')).toBeVisible()
    await expect(page.locator('#forgot-password-email')).toBeVisible()

    const submit = page.locator('button[type="submit"]')
    await expect(submit).toBeVisible()
    await expect(submit).toHaveText(/Kirim instruksi reset/)
  })

  test('skip-link still anchors the auth shell main region', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.locator('a[href="#auth-main"]')).toBeAttached()
  })

  test('back link returns to /auth.login', async ({ page }) => {
    await page.goto('/auth/forgot-password')

    const backLink = page.locator('a:has-text("Kembali ke halaman masuk")')
    await expect(backLink).toBeVisible()
    await backLink.click()
    await page.waitForURL('/')
    await expect(page.locator('#login-identifier')).toBeVisible()
  })

  test('document title reflects the route meta', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page).toHaveTitle(/Reset Password/)
  })
})
