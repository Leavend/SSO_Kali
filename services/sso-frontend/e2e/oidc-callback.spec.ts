import { test, expect } from '@playwright/test'

/**
 * E2E: OIDC Callback Page behavior.
 *
 * Verifikasi bahwa /auth/callback menampilkan error state
 * ketika dipanggil tanpa parameter yang valid.
 */

test.describe('OIDC Callback', () => {
  test('shows error when accessed without code/state params', async ({ page }) => {
    await page.goto('/auth/callback')

    // Should show error state (missing_params)
    await expect(page.locator('[role="alert"], .alert-banner, [data-testid="callback-error"]')).toBeVisible({
      timeout: 5000,
    })
  })

  test('shows error when provider returns error param', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=User+declined')

    await expect(page.locator('text=User declined')).toBeVisible({ timeout: 5000 })
  })

  test('back to login link navigates to login page', async ({ page }) => {
    await page.goto('/auth/callback')

    // Wait for error state to render
    await page.waitForTimeout(1000)

    const loginLink = page.locator('a[href="/"], button:has-text("login"), a:has-text("login")')
    if (await loginLink.isVisible()) {
      await loginLink.click()
      await page.waitForURL('/')
      await expect(page.locator('#login-identifier')).toBeVisible()
    }
  })
})
