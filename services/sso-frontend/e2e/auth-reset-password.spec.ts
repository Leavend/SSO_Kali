import { test, expect } from '@playwright/test'

/**
 * E2E — Reset Password page (UC: confirm reset using one-time token).
 *
 * Scope: route reachability + token query passthrough + form fields +
 * back link. Backend not exercised (FR-018/FR-062 covered at unit level).
 */

test.describe('Reset Password page', () => {
  test('renders all reset fields', async ({ page }) => {
    await page.goto('/auth/reset-password')

    await expect(page.locator('#reset-title')).toBeVisible()
    await expect(page.locator('#reset-password-email')).toBeVisible()
    await expect(page.locator('#reset-password-token')).toBeVisible()
    await expect(page.locator('#reset-password-new')).toBeVisible()
    await expect(page.locator('#reset-password-confirm')).toBeVisible()

    const submit = page.locator('button[type="submit"]')
    await expect(submit).toBeVisible()
    await expect(submit).toHaveText(/Reset password/)
  })

  test('honours ?token= query param by populating the token field', async ({ page }) => {
    await page.goto('/auth/reset-password?token=demo-token-xyz')

    const tokenField = page.locator('#reset-password-token')
    await expect(tokenField).toHaveValue('demo-token-xyz')
  })

  test('exposes inline strength hint with aria-live', async ({ page }) => {
    await page.goto('/auth/reset-password')

    const hint = page.locator('p[aria-live="polite"]', {
      hasText: 'Kebutuhan tersisa',
    })
    await expect(hint).toBeVisible()
  })

  test('back link returns to /auth.login', async ({ page }) => {
    await page.goto('/auth/reset-password')

    const backLink = page.locator('a:has-text("Kembali ke halaman masuk")')
    await backLink.click()
    await page.waitForURL('/')
    await expect(page.locator('#login-identifier')).toBeVisible()
  })
})
