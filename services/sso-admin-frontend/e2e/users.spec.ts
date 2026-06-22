import { expect, test } from '@playwright/test'

test.use({ locale: 'en-US' })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('dev-sso-admin-locale', 'en')
  })
})

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
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-create-user-e2e' },
        body: JSON.stringify({
          user: {
            ...user,
            subject_id: 'sub_created',
            email: 'created@example.test',
            display_name: 'Created User',
          },
          delivery_status: 'queued',
        }),
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({ users: [user] }),
    })
  })
  await page.route('**/api/admin/users/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/password-reset')) {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-reset-e2e' },
        body: JSON.stringify({
          password_reset: { token: 'reset-token-e2e', expires_at: '2026-05-27T02:00:00Z' },
          audit_event_id: 'AUD-RESET-E2E',
        }),
      })
      return
    }
    const subjectId = url.split('/').pop()
    const targetUser = subjectId === 'sub_created' ? {
      ...user,
      subject_id: 'sub_created',
      email: 'created@example.test',
      display_name: 'Created User',
    } : user
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({ user: targetUser, sessions: [] }),
    })
  })

  await page.goto('/users')

  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Target User' })).toBeVisible()
  await expect(page.getByText('REF-USERSE2E').first()).toBeVisible()

  await page.locator('button.create-user-toggle').click()
  await page.locator('input[name="create_email"]').fill('created@example.test')
  await page.locator('input[name="create_given_name"]').fill('Created')
  await page.locator('input[name="create_family_name"]').fill('User')
  await page.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByText('Activation email queued for delivery')).toBeVisible()
  await expect(page.getByText('Activation email sent')).toHaveCount(0)

  await page.getByRole('button', { name: /Target User/u }).click()
  await page.getByRole('tab', { name: 'Lifecycle' }).click()
  await page.getByRole('button', { name: 'Issue reset link' }).click()
  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(
    page.getByText(
      'Password reset dikirim melalui channel aman backend. Gunakan audit evidence untuk pelacakan.',
    ),
  ).toBeVisible()
  await page.getByText('Technical details').first().click()
  await expect(page.getByText('REF-RESETE2E').first()).toBeVisible()
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
  await page.route('**/api/admin/users/*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({ user, sessions: [] }),
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
  await page.getByRole('tab', { name: 'Lifecycle' }).click()
  await page.getByRole('button', { name: 'Lock', exact: true }).click()
  await page.getByTestId('confirm-dialog-confirm').click()

  await expect(page.getByText('fresh-auth atau MFA assurance')).toBeVisible()
  await expect(page.getByText('REF-TEPUPE2E').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
