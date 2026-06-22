import { expect, test } from '@playwright/test'

const adminUser = {
  id: 1,
  subject_id: 'sub_admin',
  email: 'admin@dev-sso.local',
  display_name: 'Admin User',
  roles: ['admin'],
}

const principalWithDashboardPermission = {
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
      capabilities: {
        'admin.dashboard.view': true,
      },
      menus: [],
    },
  },
}

const principalWithoutDashboardPermission = {
  principal: {
    ...principalWithDashboardPermission.principal,
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.panel.view'],
      capabilities: {
        'admin.dashboard.view': false,
        'admin.panel.view': true,
      },
      menus: [],
    },
  },
}

const oidcFoundationSnapshot = {
  checked_at: '2026-05-26T10:00:00+00:00',
  correlation_id: 'req_123',
  discovery: {
    issuer: 'https://sso.test',
    authorization_endpoint: 'https://sso.test/authorize',
    token_endpoint: 'https://sso.test/token',
    jwks_uri: 'https://sso.test/.well-known/jwks.json',
    userinfo_endpoint: 'https://sso.test/userinfo',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['openid', 'profile', 'email'],
    claims_supported: ['sub', 'email', 'email_verified', 'name'],
    id_token_signing_alg_values_supported: ['ES256'],
  },
  jwks: {
    keys: [
      {
        kid: 'kid-1',
        alg: 'ES256',
        use: 'sig',
        status: 'published',
        published_at: null,
        rotated_at: null,
      },
    ],
  },
  availability: {
    discovery: {
      name: 'Discovery metadata',
      status: 'healthy',
      http_status: 200,
      latency_ms: 42,
      last_checked_at: '2026-05-26T09:58:00+00:00',
      evidence_ref: 'smoke-1',
    },
    jwks: {
      name: 'JWKS public keys',
      status: 'unknown',
      http_status: null,
      latency_ms: null,
      last_checked_at: null,
      evidence_ref: null,
    },
  },
  evidence: {
    jwks_rotation: {
      status: 'missing',
      label: 'JWKS rotation evidence belum tercatat',
      environment: null,
      latest_drill_at: null,
      operator_signoff: null,
      evidence_ref: null,
    },
    availability_timeline: [],
  },
  catalog: {
    scopes: [
      {
        name: 'openid',
        label: 'Identitas OpenID',
        description: 'Login SSO',
        label_status: 'mapped',
      },
    ],
    claims: [{ name: 'email', scope_dependency: 'email', sensitivity: 'personal_data' }],
    algorithms: [{ name: 'ES256', usage: 'id_token_signing', status: 'active' }],
  },
  issuer_consistency: {
    status: 'pass',
    configured_issuer: 'https://sso.test',
    discovery_issuer: 'https://sso.test',
    public_base_url: 'https://sso.test',
    last_checked_at: '2026-05-26T10:00:00+00:00',
  },
  endpoint_consistency: [
    {
      name: 'authorization_endpoint',
      discovered_url: 'https://sso.test/authorize',
      expected_url: 'https://sso.test/authorize',
      status: 'pass',
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('dev-sso-admin-locale', 'en')
  })
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: adminUser }),
    })
  })
})

test('renders OIDC Foundation evidence for admins with dashboard permission', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principalWithDashboardPermission),
    })
  })
  await page.route('**/api/admin/oidc-foundation', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(oidcFoundationSnapshot),
    })
  })

  await page.goto('/oidc-foundation')

  await expect(
    page.getByRole('heading', { name: 'Protocol Health and Evidence FR-001–FR-005.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Discovery Metadata', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'JWKS Public Key Status', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Availability Evidence', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Scope / Claim / Algorithm Catalog', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Endpoint Consistency', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('kid-1')).toBeVisible()
  await expect(page.getByText('Identitas OpenID')).toBeVisible()
  await expect(page.getByText('client_secret')).toHaveCount(0)
  await expect(page.getByText('private_key')).toHaveCount(0)
})

test('redirects admins without dashboard permission to the forbidden page', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(principalWithoutDashboardPermission),
    })
  })

  await page.goto('/oidc-foundation')

  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'This account does not have admin access.',
  )
})
