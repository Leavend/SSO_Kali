import { expect, test } from '@playwright/test'

const session = {
  session_id: 'admin-session-1',
  client_id: 'sso-admin-frontend',
  subject_id: 'sub_target',
  user_email: 'operator@example.test',
  user_display_name: 'Operator User',
  ip_address: '203.0.113.10',
  user_agent: 'Admin Browser',
  created_at: '2026-05-31T00:00:00Z',
  last_activity_at: '2026-05-31T00:05:00Z',
}

function principal(permissions: readonly string[]) {
  return {
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
        manage_sessions: permissions.includes('admin.sessions.terminate'),
        permissions,
        capabilities: Object.fromEntries(permissions.map((permission) => [permission, true])),
        menus: [
          {
            id: 'sessions',
            label: 'Sessions',
            required_permission: 'admin.sessions.terminate',
            visible: permissions.includes('admin.sessions.terminate'),
          },
        ],
      },
    },
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('dev-sso-admin-locale', 'en')
  })
})

test('lists sessions and revokes only after confirmation', async ({ page }) => {
  let revokeCalled = false

  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.sessions.terminate'])),
    })
  })
  await page.route('**/api/admin/sessions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-sessions-list' },
      body: JSON.stringify({ sessions: [session] }),
    })
  })
  await page.route('**/api/admin/sessions/admin-session-1', async (route) => {
    if (route.request().method() === 'DELETE') {
      revokeCalled = true
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-session-revoke' },
        body: JSON.stringify({ session_id: 'admin-session-1', revoked: true }),
      })
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(session),
      })
    }
  })

  await page.goto('/sessions')

  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Sessions')
  await expect(page.getByRole('heading', { name: 'Sessions', exact: true })).toBeVisible()
  await expect(page.getByText('REF-IONSLIST').first()).toBeVisible()

  await page.getByRole('button', { name: /Operator User/ }).click()
  await expect(page.getByText('REF-SESSION1').first()).toBeVisible()
  await expect(page.getByText('Operator User').first()).toBeVisible()

  await page.getByRole('tab', { name: 'Lifecycle' }).click()
  await page.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByRole('dialog', { name: 'Revoke admin session?' })).toContainText(
    'REF-SESSION1',
  )
  expect(revokeCalled).toBe(false)

  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByText('REF-SESSION1')).toHaveCount(0)
  expect(revokeCalled).toBe(true)
})

test('blocks sessions route without terminate permission', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.dashboard.view'])),
    })
  })

  await page.goto('/sessions')

  await expect(
    page.getByRole('heading', { name: 'This account does not have admin access.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toHaveCount(0)
})

test('shows safe step-up copy when session revoke needs fresh auth', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.sessions.terminate'])),
    })
  })
  await page.route('**/api/admin/sessions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [session] }),
    })
  })
  await page.route('**/api/admin/sessions/admin-session-1', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 428,
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-session-step' },
        body: JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR trace' }),
      })
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(session),
      })
    }
  })

  await page.goto('/sessions')
  await page.getByRole('button', { name: /Operator User/ }).click()
  await page.getByRole('tab', { name: 'Lifecycle' }).click()
  await page.getByRole('button', { name: 'Revoke' }).click()
  await page.getByTestId('confirm-dialog-confirm').click()

  await expect(page.getByRole('alert')).toContainText('fresh-auth atau MFA assurance')
  await expect(page.getByText('REF-SIONSTEP').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
