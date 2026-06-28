import { expect, test, type Page } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// Playwright's `locale:'en-US'` only sets Accept-Language, which useI18n ignores. Set the
// cookie on the context so SSR renders English and the English-label selectors below match.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Full-capability admin principal (clients read + write + sessions.terminate for lifecycle).
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
      manage_sessions: true,
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
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'clients', label: 'Clients', required_permission: 'admin.clients.read', visible: true },
      ],
    },
  },
}

// Read-only admin principal WITHOUT admin.clients.read (forbidden-flow case).
const principalNoClients = {
  principal: {
    ...principal.principal,
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
      ],
    },
  },
}

const client = {
  client_id: 'acme-portal',
  display_name: 'Acme Portal',
  type: 'confidential',
  environment: 'live',
  app_base_url: 'https://acme.example.test',
  redirect_uris: ['https://acme.example.test/auth/callback'],
  post_logout_redirect_uris: ['https://acme.example.test/auth/logout'],
  allowed_scopes: ['openid', 'profile', 'email'],
  backchannel_logout_uri: 'https://acme.example.test/auth/backchannel/logout',
  backchannel_logout_internal: false,
  owner_email: 'ops@acme.example.test',
  provisioning: 'jit',
  status: 'active',
  category: 'kepegawaian',
  has_secret_hash: true,
  activated_at: '2026-06-01T00:00:00Z',
  disabled_at: null,
  secret_rotated_at: '2026-06-01T00:00:00Z',
  secret_expires_at: '2026-12-01T00:00:00Z',
}

const ONE_TIME_SECRET = 'oncesecret-e2e-acme-portal'

async function mockMe(page: Page, body: object): Promise<void> {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockClientsData(page: Page): Promise<void> {
  await page.route('**/api/admin/clients', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-clients-e2e' },
      body: JSON.stringify({ clients: [client] }),
    })
  })
  await page.route('**/api/admin/client-integrations/registrations', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ registrations: [] }) })
  })
  await page.route('**/api/admin/clients/acme-portal', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-clients-e2e' },
      body: JSON.stringify({ client }),
    })
  })
  await page.route('**/api/admin/scopes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        scopes: [
          { name: 'openid', description: 'OpenID', claims: ['sub'], default_allowed: true },
          { name: 'profile', description: 'Profile', claims: ['name'], default_allowed: true },
          { name: 'email', description: 'Email', claims: ['email'], default_allowed: true },
        ],
      }),
    })
  })
}

test('critical navigation: clients list to deep-linked detail, no token leak', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)

  await page.goto('/clients')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Clients')
  await expect(page.getByText('Acme Portal')).toBeVisible()
  // The folio client_id (a public identifier) renders.
  await expect(page.getByText('acme-portal').first()).toBeVisible()

  // ClientsTable exposes the per-row open control as a "View" button (data-testid),
  // not a link — navigation is emit('select') → navigateTo(detail).
  await page.getByTestId('clients-row-view').first().click()
  await expect(page).toHaveURL(/\/clients\/acme-portal$/u)
  await expect(page.getByRole('heading', { name: /Acme Portal/u })).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.clients.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoClients)

  await page.goto('/clients')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Clients')
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('create: confidential client shows the one-time secret once, copy works, gone after close', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.route('**/api/admin/client-integrations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-create-e2e', 'cache-control': 'no-store' },
      body: JSON.stringify({ registration: { ...client }, plaintext_secret: ONE_TIME_SECRET }),
    })
  })

  await page.goto('/clients/new')
  await page.getByLabel('Display name').fill('Acme Portal')
  await page.getByLabel('Owner email').fill('ops@acme.example.test')
  await page.getByLabel('Client type').selectOption('confidential')
  await page.getByLabel('Application category').selectOption('kepegawaian')
  await page.getByLabel('Redirect URI').fill('https://acme.example.test/auth/callback')
  await page.getByLabel('Allowed scopes').fill('openid profile email')
  await page.getByTestId('form-submit').click()

  // The plaintext secret displays once, in the reveal modal.
  await expect(page.getByTestId('client-secret-value')).toHaveText(ONE_TIME_SECRET)

  // Copy action is tested. The reveal copies the env block, which embeds the secret.
  await page.getByTestId('client-secret-copy').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(ONE_TIME_SECRET)

  // Close clears it: the secret is gone from the DOM and we land on the detail route.
  await page.getByTestId('client-secret-clear').click()
  await expect(page.getByText(ONE_TIME_SECRET)).toHaveCount(0)
  await expect(page).toHaveURL(/\/clients\/acme-portal$/u)
})

test('rotate-secret: shows the rotated secret once, cleared on close', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)

  await page.route('**/api/admin/clients/acme-portal/rotate-secret', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-rotate-e2e', 'cache-control': 'no-store' },
      body: JSON.stringify({
        rotation: {
          client_id: 'acme-portal',
          plaintext_once: ONE_TIME_SECRET,
          plaintext_secret: ONE_TIME_SECRET,
          rotated_at: '2026-06-28T12:00:00Z',
          expires_at: '2026-12-28T12:00:00Z',
        },
      }),
    })
  })

  await page.goto('/clients/acme-portal')
  // The detail page renders every panel inline (no tabs); the rotate control lives
  // in the security panel. Confirm via the step-up PrivilegedActionDialog, then the
  // one-time reveal opens. Scope to the rotation section: the lifecycle panel mounts
  // its own (force-mounted) confirm dialog too.
  const rotation = page.getByTestId('client-secret-rotation')
  await rotation.locator('[data-action="rotate-secret"]').click()
  await rotation.getByTestId('privileged-action-confirm').click()

  await expect(page.getByTestId('client-secret-value')).toHaveText(ONE_TIME_SECRET)

  // Clear from screen: the rotated plaintext is gone from the DOM.
  await page.getByTestId('client-secret-clear').click()
  await expect(page.getByText(ONE_TIME_SECRET)).toHaveCount(0)
})

test('lifecycle: disable requires a reason + confirmation, then succeeds', async ({ page }) => {
  await mockMe(page, principal)
  await mockClientsData(page)

  let disableCalled = false
  await page.route('**/api/admin/client-integrations/acme-portal/disable', async (route) => {
    disableCalled = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-disable-e2e' },
      body: JSON.stringify({ registration: { ...client, status: 'disabled', disabled_at: '2026-06-28T12:30:00Z' } }),
    })
  })

  await page.goto('/clients/acme-portal')
  const lifecycle = page.getByTestId('client-lifecycle-actions')
  // Impact summary visible before submit (it sits in the lifecycle panel header).
  await expect(lifecycle.getByText(/Impact summary/u)).toBeVisible()
  await lifecycle.locator('[data-action="disable"]').click()

  // Confirm is disabled until the reason is valid (PrivilegedActionDialog reason gate).
  await lifecycle.getByTestId('privileged-action-reason').fill('Decommissioning the staging integration.')
  await lifecycle.getByTestId('privileged-action-confirm').click()

  await expect.poll(() => disableCalled).toBe(true)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
