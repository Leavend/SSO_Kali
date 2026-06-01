import { expect, test } from '@playwright/test'

const template = {
  error_code: 'invalid_request',
  locale: 'id',
  title: 'Permintaan tidak valid',
  message: 'Periksa parameter SSO lalu coba lagi.',
  action_label: 'Coba lagi',
  action_url: null,
  retry_allowed: true,
  alternative_login_allowed: false,
  is_enabled: true,
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
            id: 'sso-error-templates',
            label: 'SSO Error Templates',
            required_permission: 'admin.security-policy.read',
            visible: permissions.includes('admin.security-policy.read'),
          },
        ],
      },
    },
  }
}

test('lists edits and resets SSO error templates', async ({ page }) => {
  const updatedTemplate = {
    ...template,
    title: 'Permintaan SSO ditolak',
    message: 'Hubungi admin bila masalah berulang.',
    action_label: 'Kembali',
  }
  const resetTemplate = { ...template, title: 'Default invalid request', is_enabled: false }

  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        principal(['admin.security-policy.read', 'admin.sso-error-templates.write']),
      ),
    })
  })
  await page.route('**/api/admin/sso-error-templates', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-templates-list' },
      body: JSON.stringify({ templates: [template] }),
    })
  })
  await page.route('**/api/admin/sso-error-templates/invalid_request', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-template-save' },
        body: JSON.stringify({ template: updatedTemplate }),
      })
      return
    }

    await route.continue()
  })
  await page.route('**/api/admin/sso-error-templates/invalid_request/reset', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-template-reset' },
      body: JSON.stringify({ template: resetTemplate }),
    })
  })

  await page.goto('/sso-error-templates')

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText(
    'SSO Error Templates',
  )
  await expect(page.getByRole('heading', { name: 'SSO Error Templates' })).toBeVisible()
  await expect(page.getByText('Permintaan tidak valid')).toBeVisible()
  await expect(page.getByText('req-templates-list')).toBeVisible()

  const invalidRequestCard = page.locator('.ui-card').filter({ hasText: 'invalid_request' }).first()
  await invalidRequestCard.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Title').fill('Permintaan SSO ditolak')
  await page.getByLabel('Message').fill('Hubungi admin bila masalah berulang.')
  await page.getByLabel('Action label').fill('Kembali')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Permintaan SSO ditolak')).toBeVisible()
  await expect(page.getByText('req-template-save')).toBeVisible()

  await page
    .locator('.ui-card')
    .filter({ hasText: 'invalid_request' })
    .first()
    .getByRole('button', { name: 'Reset' })
    .click()
  await expect(page.getByText('Default invalid request')).toBeVisible()
  await expect(page.getByText('req-template-reset')).toBeVisible()
  await expect(page.getByText(/Bearer|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('hides SSO error template write controls without write permission', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.security-policy.read'])),
    })
  })
  await page.route('**/api/admin/sso-error-templates', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ templates: [template] }),
    })
  })

  await page.goto('/sso-error-templates')

  await expect(page.getByText('Permintaan tidak valid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0)
})

test('blocks SSO error templates route without security policy read permission', async ({
  page,
}) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principal(['admin.dashboard.view'])),
    })
  })

  await page.goto('/sso-error-templates')

  await expect(
    page.getByRole('heading', { name: 'Akun ini belum memiliki akses admin.' }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toHaveCount(0)
})

test('shows safe step-up copy when saving SSO error template needs fresh auth', async ({
  page,
}) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        principal(['admin.security-policy.read', 'admin.sso-error-templates.write']),
      ),
    })
  })
  await page.route('**/api/admin/sso-error-templates', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ templates: [template] }),
    })
  })
  await page.route('**/api/admin/sso-error-templates/invalid_request', async (route) => {
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-template-step' },
      body: JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR trace' }),
    })
  })

  await page.goto('/sso-error-templates')
  const invalidRequestCard = page.locator('.ui-card').filter({ hasText: 'invalid_request' }).first()
  await invalidRequestCard.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Title').fill('Permintaan SSO ditolak')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('alert')).toContainText('fresh-auth atau MFA assurance')
  await expect(page.getByText('req-template-step')).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
