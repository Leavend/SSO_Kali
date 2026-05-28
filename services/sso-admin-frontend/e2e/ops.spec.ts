import { expect, test } from '@playwright/test'

const principal = {
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
          id: 'ops',
          label: 'Ops',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
      ],
    },
  },
}

const readiness = {
  service: 'sso-backend',
  ready: true,
  checks: {
    database: true,
    redis: true,
    queue: { pending_jobs: 0, failed_jobs: 0, oldest_pending_age_seconds: null },
  },
}

test('renders ops readiness and evidence placeholders', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/ops/readiness', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-ops-e2e' },
      body: JSON.stringify(readiness),
    })
  })

  await page.goto('/ops')

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText('Ops')
  await expect(page.getByRole('heading', { name: 'Ops Evidence' })).toBeVisible()
  await expect(page.getByText('sso-backend')).toBeVisible()
  await expect(page.getByText('ready')).toBeVisible()
  await expect(page.getByText('JWKS rotation drill')).toBeVisible()
  await expect(page.getByText('SIEM sink verification')).toBeVisible()
  await expect(page.getByText('Request ID: req-ops-e2e')).toBeVisible()
  await expect(page.getByText(/Bearer|metrics token|secret|SQLSTATE/u)).toHaveCount(0)
})

test('shows safe ops error with request ID', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/ops/readiness', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-ops-fail' },
      body: JSON.stringify({ error: 'server_error', message: 'raw metrics token leak' }),
    })
  })

  await page.goto('/ops')

  await expect(page.getByRole('heading', { name: 'Ops evidence belum bisa dimuat' })).toBeVisible()
  await expect(page.getByText('Request ID: req-ops-fail')).toBeVisible()
  await expect(page.getByText('raw metrics token')).toHaveCount(0)
})
