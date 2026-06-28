import { expect, test } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// Playwright's `locale:'en-US'` only sets Accept-Language, which useI18n ignores, and there is
// no `dev-sso-admin-locale` localStorage bridge in the Nuxt stack. Set the cookie on the context
// so SSR renders English and the English-label selectors below match the rendered UI.
// NOTE: the merged e2e/dashboard.spec.ts carries the same legacy (broken) locale pattern — apply
// this identical `admin_locale=en` cookie fix there too so its English selectors resolve.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Full-capability admin principal (read + write + lock + roles.write).
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
        'admin.roles.read',
        'admin.roles.write',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.users.read': true,
        'admin.users.write': true,
        'admin.users.lock': true,
        'admin.roles.read': true,
        'admin.roles.write': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'users', label: 'Users', required_permission: 'admin.users.read', visible: true },
      ],
    },
  },
}

// Read-only admin principal WITHOUT admin.users.read (forbidden-flow case).
const principalNoUsers = {
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

const user = {
  id: 4021,
  subject_id: 'sub_target',
  email: 'target.user@example.test',
  given_name: 'Target',
  family_name: 'User',
  display_name: 'Target User',
  role: 'user',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: '2026-06-20T09:15:00Z',
  email_verified_at: '2026-06-19T08:00:00Z',
  last_login_at: '2026-06-27T22:40:00Z',
  created_at: '2026-01-04T03:30:00Z',
  nik: '3174********4321',
  nip: '1985**********1007',
  nisn: '0098****56',
  birth_date: '1987-**-**',
  mfa_enrolled: true,
  mfa_methods: ['totp'],
  mfa_mandatory: false,
  roles: [{ slug: 'user', name: 'User', is_system: true }],
}

async function mockMe(page, body) {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockUsersData(page) {
  await page.route('**/api/admin/users', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({ users: [user] }),
    })
  })
  await page.route('**/api/admin/users/sub_target', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-users-e2e' },
      body: JSON.stringify({
        user,
        login_context: { ip_address: '203.0.113.7', mfa_required: false, last_seen_at: '2026-06-27T22:41:00Z' },
        sessions: [],
      }),
    })
  })
  await page.route('**/api/admin/roles', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        roles: [
          { id: 1, slug: 'user', name: 'User', description: null, is_system: true, permissions: [], user_count: 1, users_count: 1 },
          { id: 2, slug: 'pegawai', name: 'Pegawai', description: null, is_system: false, permissions: [], user_count: 0, users_count: 0 },
        ],
      }),
    })
  })
}

test('critical navigation: list → deep-linked detail with masked PII, no token', async ({ page }) => {
  await mockMe(page, principal)
  await mockUsersData(page)

  await page.goto('/users')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.getByText('Target User')).toBeVisible()

  await page.getByRole('link', { name: /Target User/u }).click()
  await expect(page).toHaveURL(/\/users\/sub_target$/u)
  await expect(page.getByRole('heading', { name: 'Target User' })).toBeVisible()
  // Masked identifier is rendered; no raw 16/18/10-digit PII, no token.
  await expect(page.getByText('3174********4321')).toBeVisible()
  await expect(page.getByText(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/u)).toHaveCount(0)
  await expect(page.getByText(/Bearer|access_token|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.users.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoUsers)

  await page.goto('/users')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Users')
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('role assignment: high-risk path succeeds and surfaces safe step-up on 428', async ({ page }) => {
  await mockMe(page, principal)
  await mockUsersData(page)

  let assignAttempt = 0
  await page.route('**/api/admin/users/sub_target/roles', async (route) => {
    assignAttempt += 1
    if (assignAttempt === 1) {
      await route.fulfill({
        status: 428,
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-stepup-e2e' },
        body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-assign-e2e' },
      body: JSON.stringify({
        user: { subject_id: 'sub_target', email: 'target.user@example.test', display_name: 'Target User', role: 'pegawai', status: 'active', roles: [{ slug: 'pegawai', name: 'Pegawai', is_system: false }] },
      }),
    })
  })

  await page.goto('/users/sub_target')

  // High-risk path #1: backend demands step-up — safe copy, redacted ref, no raw trace.
  await page.getByRole('radio', { name: 'Pegawai' }).check()
  await page.getByRole('button', { name: 'Save Role' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/step-up|MFA assurance/u)).toBeVisible()
  await expect(page.getByText('REF-TEPUPE2E').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)

  // High-risk path #2: retry succeeds.
  await page.getByRole('button', { name: 'Save Role' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Pegawai')).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})
