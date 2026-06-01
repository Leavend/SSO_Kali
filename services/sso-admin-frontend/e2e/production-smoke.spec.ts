import { expect, test } from '@playwright/test'

const authenticatedPrincipal = {
  principal: {
    subject_id: 'admin-smoke-subject',
    email: 'admin-smoke@example.test',
    display_name: 'Admin Smoke',
    role: 'admin',
    last_login_at: '2026-06-01T00:00:00Z',
    auth_context: {
      auth_time: 1_780_000_000,
      amr: ['pwd', 'mfa'],
      acr: 'urn:timeh:aal2',
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
      ],
    },
  },
}

const authenticatedDashboardSummary = {
  generated_at: '2026-06-01T00:00:00Z',
  counters: {
    users: { total: 1, active: 1, disabled: 0, locked: 0 },
    sessions: { portal_active: 1, rp_active: 1 },
    clients: { total: 1, active: 1, staged: 0, decommissioned: 0 },
    audit: { admin_last_24h: 1, auth_last_24h: 1 },
    incidents: { admin_denied_last_24h: 0 },
    data_subject_requests: { submitted: 0, approved: 0, rejected: 0, fulfilled: 0, on_hold: 0 },
  },
}

test('cold visit diagnoses an HTML admin API response without falling into the generic error view', async ({
  page,
}) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body>spa fallback</body></html>',
    })
  })

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/admin-api-unreachable$/u)
  await expect(
    page.getByRole('heading', { name: 'Admin API tidak mengembalikan JSON yang valid.' }),
  ).toBeVisible()
  await expect(page).not.toHaveURL(/\/admin-error$/u)
})

test('stubbed OIDC admin session reaches dashboard with principal evidence', async ({ page }) => {
  let principalRequests = 0

  await page.route('**/auth/login**', async (route) => {
    const requestUrl = new URL(route.request().url())
    await route.fulfill({
      status: 302,
      headers: {
        location: `${requestUrl.origin}/auth/callback?code=stub-admin-code&state=stub-admin-state`,
      },
    })
  })

  await page.route('**/api/admin/me', async (route) => {
    principalRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-admin-smoke-me' },
      body: JSON.stringify(authenticatedPrincipal),
    })
  })

  await page.route('**/api/admin/dashboard/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-admin-smoke-dashboard' },
      body: JSON.stringify(authenticatedDashboardSummary),
    })
  })

  await page.goto('/auth/login?return_to=/dashboard')
  await expect(page).toHaveURL(/\/auth\/callback\?code=stub-admin-code&state=stub-admin-state$/u)

  await page.context().addCookies([
    {
      name: '__Host-sso-admin-session',
      value: 'stub-admin-session-cookie-value-that-is-long-enough',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    },
  ])
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/dashboard$/u)
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(page.getByText('admin-smoke@example.test')).toBeVisible()
  await expect(page.getByText('Dashboard evidence')).toBeVisible()
  await expect(page.getByText('req-admin-smoke-dashboard')).toBeVisible()
  await expect(page.getByText(/access_token|refresh_token|id_token|Bearer/u)).toHaveCount(0)
  expect(principalRequests).toBeGreaterThan(0)
})

test('legacy /home path is handled by the admin SPA catch-all instead of rendering blank', async ({
  page,
}) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authenticatedPrincipal),
    })
  })
  await page.route('**/api/admin/dashboard/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-home-catch-all' },
      body: JSON.stringify(authenticatedDashboardSummary),
    })
  })

  await page.goto('/home')

  await expect(page).toHaveURL(/\/dashboard$/u)
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(page.getByText('req-home-catch-all')).toBeVisible()
})
