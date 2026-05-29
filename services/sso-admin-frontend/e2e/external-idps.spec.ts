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
      permissions: ['admin.dashboard.view', 'admin.external-idps.read'],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.external-idps.read': true,
      },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'external-idps',
          label: 'External IdPs',
          required_permission: 'admin.external-idps.read',
          visible: true,
        },
      ],
    },
  },
}

const provider = {
  provider_key: 'google',
  display_name: 'Google Workspace',
  issuer: 'https://accounts.google.com',
  metadata_url: 'https://accounts.google.com/.well-known/openid-configuration',
  client_id: 'google-client',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  allowed_algorithms: ['RS256'],
  scopes: ['openid', 'profile', 'email'],
  priority: 10,
  enabled: true,
  is_backup: false,
  tls_validation_enabled: true,
  signature_validation_enabled: true,
  has_client_secret: true,
  health_status: 'healthy',
}

test('renders external IdP provider and mapping evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/external-idps', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-idp-e2e' },
      body: JSON.stringify({ providers: [provider] }),
    })
  })
  await page.route('**/api/admin/external-idps/google/mapping-preview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-idp-e2e' },
      body: JSON.stringify({
        preview: {
          mapped: { subject_id: 'sub_123', email: 'admin@example.test' },
          errors: [],
          warnings: ['Email verified claim missing'],
          missing_email_strategy: 'reject',
          safe_to_link: true,
        },
      }),
    })
  })

  await page.goto('/external-idps')
  await page.getByRole('button', { name: 'Preview mapping' }).click()

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText('External IdPs')
  await expect(page.getByRole('heading', { name: 'External IdPs' })).toBeVisible()
  const providerList = page.getByRole('heading', { name: 'Provider list' }).locator('..')
  await expect(providerList).toContainText('Google Workspace')
  await expect(providerList).toContainText('healthy')
  await expect(page.getByText('safe to link: true')).toBeVisible()
  await expect(page.getByText('Federation evidence')).toBeVisible()
  await expect(page.getByText('Request ID')).toBeVisible()
  await expect(page.getByText('req-idp-e2e')).toBeVisible()
  await expect(page.getByText(/Bearer|client_secret|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('shows safe step-up copy for provider disable', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/external-idps', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-idp-step' },
      body: JSON.stringify({ providers: [provider] }),
    })
  })
  await page.route('**/api/admin/external-idps/google', async (route) => {
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-idp-step' },
      body: JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR trace' }),
    })
  })

  await page.goto('/external-idps')
  await page.getByRole('button', { name: 'Disable provider' }).click()

  await expect(page.getByText('fresh-auth atau MFA assurance')).toBeVisible()
  await expect(page.getByText('req-idp-step')).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
