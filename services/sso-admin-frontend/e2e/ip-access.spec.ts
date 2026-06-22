import { expect, test } from '@playwright/test'

const rule = {
  id: 41,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'Blocked test network',
  expires_at: '2026-06-30',
  actor_subject_id: 'sub_admin',
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
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
        manage_sessions: false,
        permissions,
        capabilities: Object.fromEntries(permissions.map((permission) => [permission, true])),
        menus: [
          {
            id: 'ip-access',
            label: 'IP Access',
            required_permission: 'admin.ip-access.read',
            visible: permissions.includes('admin.ip-access.read'),
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

test('lists creates and deletes IP access rules with confirmation', async ({ page }) => {
  let deleteCalled = false
  const createdRule = {
    ...rule,
    id: 42,
    cidr: '198.51.100.0/24',
    reason: 'Allow partner office',
    mode: 'allow',
  }

  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.ip-access.read', 'admin.ip-access.write'])),
    })
  })
  await page.route('**/api/admin/ip-access-rules', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-ip-create' },
        body: JSON.stringify({ rule: createdRule }),
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-ip-list' },
      body: JSON.stringify({ rules: [rule] }),
    })
  })
  await page.route('**/api/admin/ip-access-rules/41', async (route) => {
    deleteCalled = true
    await route.fulfill({ status: 204 })
  })

  await page.goto('/ip-access')

  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('IP Access')
  await expect(page.getByRole('heading', { name: 'IP Access Rules' })).toBeVisible()
  await expect(page.getByText('203.0.113.0/24')).toBeVisible()
  await expect(page.getByText('REF-EQIPLIST').first()).toBeVisible()

  await page.getByLabel('CIDR').fill('198.51.100.0/24')
  await page.getByLabel('Mode').selectOption('allow')
  await page.getByLabel('Reason').fill('Allow partner office')
  await page.getByRole('button', { name: 'Add IP Rule' }).click()
  await expect(page.getByText('198.51.100.0/24')).toBeVisible()
  await expect(page.getByText('REF-IPCREATE').first()).toBeVisible()

  await page
    .getByRole('row', { name: /203\.0\.113\.0\/24/u })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Delete IP access rule?' })).toContainText(
    '203.0.113.0/24',
  )
  expect(deleteCalled).toBe(false)

  await page.getByTestId('confirm-dialog-confirm').click()
  await expect(page.getByText('203.0.113.0/24')).toHaveCount(0)
  expect(deleteCalled).toBe(true)
})

test('hides write controls when admin has read-only IP access permission', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.ip-access.read'])),
    })
  })
  await page.route('**/api/admin/ip-access-rules', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ rules: [rule] }),
    })
  })

  await page.goto('/ip-access')

  await expect(page.getByText('203.0.113.0/24')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add IP Rule' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
})

test('blocks IP access route without read permission', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.dashboard.view'])),
    })
  })

  await page.goto('/ip-access')

  await expect(
    page.getByRole('heading', { name: 'This account does not have admin access.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toHaveCount(0)
})

test('shows safe step-up copy when creating IP access rule needs fresh auth', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.ip-access.read', 'admin.ip-access.write'])),
    })
  })
  await page.route('**/api/admin/ip-access-rules', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 428,
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-ip-step' },
        body: JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR trace' }),
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ rules: [rule] }),
    })
  })

  await page.goto('/ip-access')
  await page.getByLabel('CIDR').fill('198.51.100.0/24')
  await page.getByLabel('Reason').fill('Allow partner office')
  await page.getByRole('button', { name: 'Add IP Rule' }).click()

  await expect(page.getByRole('alert')).toContainText('fresh-auth atau MFA assurance')
  await expect(page.getByText('REF-EQIPSTEP').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
