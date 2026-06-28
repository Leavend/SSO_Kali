import { expect, test } from '@playwright/test'

const dashboardPrincipal = {
  principal: {
    subject_id: 'sub_admin',
    email: 'admin@dev-sso.local',
    display_name: 'Admin User',
    role: 'admin',
    last_login_at: null,
    auth_context: {
      auth_time: null,
      amr: ['pwd', 'mfa'],
      acr: 'urn:example:loa:2',
      mfa_enforced: true,
      mfa_verified: true,
    },
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'users',
          label: 'Users',
          required_permission: 'admin.users.read',
          visible: false,
        },
      ],
    },
  },
}

const dashboardSummary = {
  generated_at: '2026-05-27T00:00:00Z',
  counters: {
    users: { total: 10, active: 8, disabled: 1, locked: 1 },
    sessions: { portal_active: 5, rp_active: 7 },
    clients: { total: 3, active: 2, staged: 1, decommissioned: 0 },
    audit: { admin_last_24h: 4, auth_last_24h: 9 },
    incidents: { admin_denied_last_24h: 2 },
    data_subject_requests: { submitted: 1, approved: 1, rejected: 0, fulfilled: 2, on_hold: 0 },
  },
}

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// the legacy `dev-sso-admin-locale` localStorage bridge does not exist in the Nuxt stack, so
// set the cookie on the context for the English-label selectors below to resolve.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

test('renders permission-aware admin shell and dashboard summary evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(dashboardPrincipal),
    })
  })
  await page.route('**/api/admin/dashboard/summary', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-dashboard-e2e' },
      body: JSON.stringify(dashboardSummary),
    })
  })

  await page.goto('/dashboard')

  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Dashboard')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(page.getByText('Dashboard evidence')).toBeVisible()
  await expect(page.getByText('Reference code')).toBeVisible()
  await expect(page.getByText('REF-BOARDE2E').first()).toBeVisible()
  await expect(page.getByText('10')).toBeVisible()
  await expect(page.getByText(/Bearer|refreshToken|idToken/u)).toHaveCount(0)
})

test('shows safe dashboard error with request evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(dashboardPrincipal),
    })
  })
  await page.route('**/api/admin/dashboard/summary', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-dashboard-fail' },
      body: JSON.stringify({ error: 'server_error', message: 'SQLSTATE leaked admin trace' }),
    })
  })

  await page.goto('/dashboard')

  await expect(
    page.getByRole('heading', { name: 'Admin dashboard could not be loaded' }),
  ).toBeVisible()
  await expect(page.getByText('REF-OARDFAIL', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('SQLSTATE')).toHaveCount(0)
})
