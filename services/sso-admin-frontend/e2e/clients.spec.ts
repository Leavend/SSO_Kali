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
        'admin.clients.read',
        'admin.clients.write',
        'admin.sessions.terminate',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.clients.read': true,
        'admin.clients.write': true,
        'admin.sessions.terminate': true,
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
  post_logout_redirect_uris: ['https://app.example.test'],
  backchannel_logout_uri: 'https://app.example.test/logout',
  allowed_scopes: ['openid', 'profile'],
  owner_email: 'owner@example.test',
  status: 'active',
  secret_rotated_at: '2026-05-27T00:00:00Z',
  has_secret_hash: true,
}

test('renders OAuth client console, evidence panel, and one-time client secret flow', async ({
  page,
}) => {
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
  await page.route('**/api/admin/client-integrations/registrations', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-client-registrations-e2e' },
      body: JSON.stringify({ registrations: [client] }),
    })
  })
  await page.route('**/api/admin/client-integrations/stage', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-create-client-e2e' },
      body: JSON.stringify({
        registration: {
          ...client,
          client_id: 'prototype-app-b',
          display_name: 'Prototype App B',
          redirect_uris: ['https://app-b.example.test/callback'],
          post_logout_redirect_uris: ['https://app-b.example.test'],
          backchannel_logout_uri: 'https://app-b.example.test/auth/backchannel/logout',
          status: 'staged',
        },
      }),
    })
  })
  await page.route('**/api/admin/clients/prototype-app-a', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-decommission-e2e' },
        body: JSON.stringify({
          registration: { ...client, status: 'decommissioned', redirect_uris: [] },
        }),
      })
      return
    }

    const payload =
      route.request().method() === 'PATCH'
        ? (route.request().postDataJSON() as Partial<typeof client>)
        : {}
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-update-uri-e2e' },
      body: JSON.stringify({
        client: {
          ...client,
          redirect_uris: payload.redirect_uris ?? ['https://app.example.test/new-callback'],
          post_logout_redirect_uris: payload.post_logout_redirect_uris ?? [
            'https://app.example.test',
          ],
          backchannel_logout_uri:
            payload.backchannel_logout_uri ?? 'https://app.example.test/new-logout',
        },
      }),
    })
  })
  await page.route('**/api/admin/clients/prototype-app-a/scopes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-scope-sync-e2e' },
      body: JSON.stringify({
        client: { ...client, allowed_scopes: ['openid', 'profile', 'email'] },
      }),
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
  await page.route('**/api/admin/client-integrations/prototype-app-a/disable', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-disable-e2e' },
      body: JSON.stringify({
        registration: { ...client, status: 'disabled', disabled_at: '2026-05-28T00:00:00Z' },
      }),
    })
  })

  await page.goto('/clients')

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText('OAuth Clients')
  await expect(page.getByRole('navigation', { name: 'Modul admin' })).not.toContainText('Users')
  await expect(page.getByRole('heading', { name: 'OAuth Clients' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prototype App A' })).toBeVisible()
  await expect(page.getByText('https://app.example.test/callback')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Backchannel logout URI' })).toBeVisible()
  await expect(page.getByText('https://app.example.test/logout')).toBeVisible()
  await expect(page.getByText('Client evidence')).toBeVisible()
  await expect(page.getByText('Kode referensi')).toBeVisible()
  await expect(page.getByText('req-clients-e2e')).toBeVisible()

  await page.locator('input[name="client_id"]').fill('prototype-app-b')
  await page.locator('input[name="create_display_name"]').fill('Prototype App B')
  await page.locator('input[name="create_owner_email"]').fill('owner@example.test')
  await page
    .locator('input[name="create_redirect_uri"]')
    .fill('https://app-b.example.test/callback')
  await page
    .locator('input[name="create_backchannel_logout_uri"]')
    .fill('https://app-b.example.test/auth/backchannel/logout')
  const createRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().includes('/api/admin/client-integrations/stage'),
  )
  await page.getByRole('button', { name: 'Create client' }).click()
  await createRequest
  await expect(page.getByRole('heading', { name: 'Prototype App B' })).toBeVisible()
  await expect(page.getByText('req-create-client-e2e')).toBeVisible()

  await page.getByRole('button', { name: /Prototype App A/u }).click()
  await expect(page.locator('textarea[name="redirect_uris"]')).toHaveValue(/new-callback/u)
  await page.locator('textarea[name="redirect_uris"]').fill('https://app.example.test/new-callback')
  await page.locator('textarea[name="post_logout_redirect_uris"]').fill('https://app.example.test')
  await page
    .locator('input[name="backchannel_logout_uri"]')
    .fill('https://app.example.test/new-logout')
  const uriUpdateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes('/api/admin/clients/prototype-app-a'),
  )
  await page.locator('form[data-test="uri-policy-form"]').getByRole('button').click()
  await uriUpdateResponse
  await expect(page.getByText('https://app.example.test/new-callback')).toBeVisible()
  await expect(page.getByText('req-update-uri-e2e')).toBeVisible()

  await expect(page.getByText('Scope & consent policy')).toBeVisible()
  const allowedScopesInput = page.locator('textarea[name="allowed_scopes"]')
  await allowedScopesInput.fill('openid\nprofile\nemail')
  await expect(allowedScopesInput).toHaveValue(/email/u)
  const scopeUpdateRequest = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request.url().includes('/api/admin/clients/prototype-app-a/scopes') &&
      (request.postData() ?? '').includes('email'),
  )
  await page.locator('form[data-test="scope-policy-form"]').getByRole('button').click()
  await scopeUpdateRequest
  await expect(allowedScopesInput).toHaveValue(/email/u)

  await expect(page.getByText('Client lifecycle')).toBeVisible()
  await expect(page.getByText('Impact summary')).toBeVisible()
  await page.locator('textarea[name="client_disable_reason"]').fill('incident response')
  await page.getByRole('button', { name: 'Disable client' }).click()
  await expect(page.getByText('req-disable-e2e')).toBeVisible()
  await expect(page.locator('.ui-badge')).toContainText('disabled')
  await page.locator('input[name="decommission_confirmation"]').fill('prototype-app-a')
  await page.getByRole('button', { name: 'Decommission client' }).click()
  await expect(page.getByText('req-decommission-e2e')).toBeVisible()
  await expect(page.locator('.ui-badge')).toContainText('decommissioned')

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
  await page.route('**/api/admin/client-integrations/registrations', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-client-registrations-e2e' },
      body: JSON.stringify({ registrations: [] }),
    })
  })

  await page.goto('/clients')

  await expect(page.getByRole('heading', { name: 'OAuth clients belum bisa dimuat' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('req-clients-fail')
  await expect(page.getByText('SQLSTATE')).toHaveCount(0)
})
