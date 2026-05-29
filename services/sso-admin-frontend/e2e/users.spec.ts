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
      permissions: [
        'admin.dashboard.view',
        'admin.users.read',
        'admin.users.write',
        'admin.users.lock',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.users.read': true,
        'admin.users.write': true,
        'admin.users.lock': true,
      },
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
          visible: true,
        },
      ],
    },
  },
}

const user = {
  subject_id: 'sub_target',
  email: 'target@example.test',
  display_name: 'Target User',
  role: 'user',
  status: 'active',
  local_account_enabled: true,
  email_verified_at: '2026-05-27T00:00:00Z',
  last_login_at: '2026-05-27T01:00:00Z',
}

test('renders user lifecycle console and safe reset evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/users', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({ users: [user] }),
    })
  })
  await page.route('**/api/admin/users/sub_target/password-reset', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-reset-e2e' },
      body: JSON.stringify({
        password_reset: { token: 'reset-token-e2e', expires_at: '2026-05-27T02:00:00Z' },
        audit_event_id: 'AUD-RESET-E2E',
      }),
    })
  })

  await page.goto('/users')

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Target User' })).toBeVisible()
  await expect(page.getByText('req-users-e2e')).toBeVisible()

  await page.getByRole('button', { name: 'Issue reset link' }).click()
  await expect(
    page.getByText(
      'Password reset dikirim melalui channel aman backend. Gunakan audit evidence untuk pelacakan.',
    ),
  ).toBeVisible()
  await expect(page.getByText('AUD-RESET-E2E')).toBeVisible()
  await expect(page.getByText('req-reset-e2e')).toBeVisible()
  await expect(page.getByText('reset-token-e2e')).toHaveCount(0)
  await expect(page.getByText(/Bearer|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('shows safe step-up copy for lifecycle action failures', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/users', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ users: [user] }),
    })
  })
  await page.route('**/api/admin/users/sub_target/lock', async (route) => {
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-step-up-e2e' },
      body: JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR failure trace' }),
    })
  })

  await page.goto('/users')
  await page.getByRole('button', { name: 'Lock', exact: true }).click()

  await expect(page.getByText('fresh-auth atau MFA assurance')).toBeVisible()
  await expect(page.getByText('req-step-up-e2e')).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
