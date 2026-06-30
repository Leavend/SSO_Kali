import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// SSR is served by the e2e Nitro layer (test/fixtures/e2e). Both /api/admin/me
// and /api/admin/dashboard/summary are handled server-side — page.route() cannot
// intercept them. Locale and permission scope come from cookies set before goto().

test('renders permission-aware admin shell and dashboard counters', async ({ page }) => {
  await useEnglish(page)
  // Scope to dashboard-only so the nav visibility check is meaningful
  await usePermissions(page, ['admin.dashboard.view'])

  await page.goto('/dashboard')

  // Shell: nav is permission-filtered — only dashboard visible at this scope
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Dashboard')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Users')

  // Page heading and evidence header from the SSR-rendered summary
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(page.getByText('Generated at')).toBeVisible()

  // Counter from the layer fixture: users.total = 1250, formatted by Intl.NumberFormat
  await expect(page.getByText('1,250')).toBeVisible()

  // Token-leak gate: no raw credential in the DOM
  await expect(page.getByText(/Bearer|refreshToken|idToken/u)).toHaveCount(0)
})

test('shows safe dashboard error with request evidence', async ({ page }) => {
  await useEnglish(page)
  // Cookie toggle: instructs the layer handler to return 500 during SSR
  await page.context().addCookies([
    { name: 'e2e_dashboard_status', value: '500', url: 'http://localhost:3000' },
  ])

  await page.goto('/dashboard')

  // Error view title (dashboard.error_title)
  await expect(
    page.getByRole('heading', { name: 'Admin dashboard could not be loaded' }),
  ).toBeVisible()

  // NOTE: the support REF is derived from ApiError.requestId, whose custom field
  // does NOT survive SSR error serialization to the client (documented Phase-12
  // limitation), so it is asserted by the unit suite, not here. The error VIEW +
  // the no-raw-internals invariant are the meaningful hydrated assertions.
  await expect(page.getByText('SQLSTATE')).toHaveCount(0)
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})
