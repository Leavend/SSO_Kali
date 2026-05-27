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
      permissions: ['admin.dashboard.view', 'admin.clients.read', 'admin.clients.write'],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.clients.read': true,
        'admin.clients.write': true,
      },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'clients',
          label: 'OAuth Clients',
          required_permission: 'admin.clients.read',
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

const client = {
  client_id: 'prototype-app-a',
  display_name: 'Prototype App A',
  type: 'confidential',
  environment: 'production',
  app_base_url: 'https://app.example.test',
  redirect_uris: ['https://app.example.test/callback'],
  post_logout_redirect_uris: ['https://app.example.test/logout'],
  allowed_scopes: ['openid', 'profile'],
  owner_email: 'owner@example.test',
  status: 'active',
  secret_rotated_at: '2026-05-27T00:00:00Z',
  has_secret_hash: true,
}

test('renders OAuth client console and one-time secret evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/clients', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-clients-e2e' },
      body: JSON.stringify({ clients: [client] }),
    })
  })
  await page.route('**/api/admin/clients/prototype-app-a/rotate-secret', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-rotate-e2e' },
      body: JSON.stringify({
        rotation: { client_id: 'prototype-app-a', plaintext_secret: 'once-secret-e2e' },
      }),
    })
  })

  await page.goto('/clients')

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText('OAuth Clients')
  await expect(page.getByRole('navigation', { name: 'Modul admin' })).not.toContainText('Users')
  await expect(page.getByRole('heading', { name: 'OAuth Clients' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prototype App A' })).toBeVisible()
  await expect(page.getByText('https://app.example.test/callback')).toBeVisible()
  await expect(page.getByText('req-clients-e2e')).toBeVisible()

  await page.getByRole('button', { name: 'Rotate secret' }).click()
  await expect(page.getByText('once-secret-e2e')).toBeVisible()
  await expect(page.getByText('req-rotate-e2e')).toBeVisible()

  await page.getByRole('button', { name: 'Hapus secret dari layar' }).click()
  await expect(page.getByText('once-secret-e2e')).toHaveCount(0)
  await expect(page.getByText(/Bearer|refreshToken|idToken|secret_hash/u)).toHaveCount(0)
})

test('shows safe OAuth clients error with request evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/clients', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-clients-fail' },
      body: JSON.stringify({ error: 'server_error', message: 'SQLSTATE leaked client trace' }),
    })
  })

  await page.goto('/clients')

  await expect(page.getByRole('heading', { name: 'OAuth clients belum bisa dimuat' })).toBeVisible()
  await expect(page.getByText('Request ID: req-clients-fail')).toBeVisible()
  await expect(page.getByText('SQLSTATE')).toHaveCount(0)
})
