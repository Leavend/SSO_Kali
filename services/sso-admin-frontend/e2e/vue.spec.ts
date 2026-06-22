import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('dev-sso-admin-locale', 'en')
  })
})

test('renders the forbidden page without an admin session', async ({ page }) => {
  await page.goto('/forbidden')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'This account does not have admin access.',
  )
  const portalLink = page.getByRole('link', { name: 'Back to SSO Portal' })
  await expect(portalLink).toBeVisible()
  await expect(portalLink).toHaveAttribute('href', /^https:\/\/[^/]+\/home$/u)
})

test('renders the admin error portal link as an absolute portal URL', async ({ page }) => {
  await page.goto('/admin-error')

  const portalLink = page.getByRole('link', { name: 'Kembali ke Portal SSO' })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Admin frontend belum bisa memuat status akses.',
  )
  await expect(portalLink).toHaveAttribute('href', /^https:\/\/[^/]+\/home$/u)
})
