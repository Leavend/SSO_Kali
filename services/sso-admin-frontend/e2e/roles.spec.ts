import { expect, test, type Page } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id').
// Set it to 'en' so the English label selectors below match the rendered output.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Full-capability admin: roles read + write + sessions.terminate (delete is double-gated).
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
        'admin.roles.read',
        'admin.roles.write',
        'admin.sessions.terminate',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.roles.read': true,
        'admin.roles.write': true,
        'admin.sessions.terminate': true,
      },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        { id: 'roles', label: 'Roles', required_permission: 'admin.roles.read', visible: true },
      ],
    },
  },
}

// Read-only admin WITHOUT admin.roles.read (forbidden-flow case).
const principalNoRoles = {
  principal: {
    ...principal.principal,
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
      ],
    },
  },
}

const systemRole = {
  id: 1,
  slug: 'admin',
  name: 'Administrator',
  description: 'Built-in administrator role.',
  is_system: true,
  permissions: [{ slug: 'admin.users.read', name: 'View users', category: 'Users' }],
  user_count: 3,
  users_count: 3,
}

const customRole = {
  id: 2,
  slug: 'content-editor',
  name: 'Content Editor',
  description: 'Custom content + user management role.',
  is_system: false,
  permissions: [{ slug: 'admin.users.read', name: 'View users', category: 'Users' }],
  user_count: 7,
  users_count: 7,
}

const permissions = {
  permissions: [
    {
      slug: 'admin.users.read',
      name: 'View users',
      description: 'Read the user directory.',
      category: 'Users',
    },
    {
      slug: 'admin.users.write',
      name: 'Manage users',
      description: 'Create and edit users.',
      category: 'Users',
    },
  ],
}

async function mockMe(page: Page, body: object): Promise<void> {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockRolesData(page: Page): Promise<void> {
  await page.route('**/api/admin/roles', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-roles-e2e' },
      body: JSON.stringify({ roles: [systemRole, customRole] }),
    })
  })
  await page.route('**/api/admin/permissions', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(permissions) })
  })
}

test('matrix high-risk path: toggle a permission, confirm the sync impact summary, PUT fires', async ({
  page,
}) => {
  await mockMe(page, principal)
  await mockRolesData(page)

  let syncBody: unknown = null
  await page.route('**/api/admin/roles/content-editor/permissions', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    syncBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-sync-e2e' },
      body: JSON.stringify({ role: { ...customRole, permissions: permissions.permissions } }),
    })
  })

  await page.goto('/roles')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Roles')

  // The matrix mounted: the custom role column + a permission row both render.
  await expect(page.getByText('Content Editor').first()).toBeVisible()
  await expect(page.getByText('Manage users').first()).toBeVisible()

  // Grant "Manage users" to the custom role (editable cell = UiSwitch, aria-label
  // "<role name>: <permission>"). The system role's column is a read-only badge, not a switch.
  await page.getByRole('switch', { name: 'Content Editor: Manage users' }).click()

  // Saving the dirty column opens the reused confirm dialog with the blast-radius impact.
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText(/changes the permission set for 7 users/iu)).toBeVisible()

  // Confirm → the PUT-replace fires with the full pending permission set.
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => syncBody).not.toBeNull()
  expect(syncBody).toMatchObject({
    permission_slugs: expect.arrayContaining(['admin.users.read', 'admin.users.write']),
  })
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('cancel calls no API: dismissing the sync confirm fires no PUT', async ({ page }) => {
  await mockMe(page, principal)
  await mockRolesData(page)

  let putCalled = false
  await page.route('**/api/admin/roles/content-editor/permissions', async (route) => {
    if (route.request().method() === 'PUT') putCalled = true
    await route.continue()
  })

  await page.goto('/roles')
  await page.getByRole('switch', { name: 'Content Editor: Manage users' }).click()
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(putCalled).toBe(false)
})

test('system role is protected: no editable switch + no delete in its column', async ({ page }) => {
  await mockMe(page, principal)
  await mockRolesData(page)

  await page.goto('/roles')
  // The system role's permission cell is a read-only status badge, never a switch.
  await expect(page.getByRole('switch', { name: 'Administrator: Manage users' })).toHaveCount(0)
  // The system role row hides Delete (UX minimization over the authoritative backend gate).
  const adminRow = page.getByRole('row', { name: /Administrator/u })
  await expect(adminRow.getByRole('button', { name: 'Delete' })).toHaveCount(0)
})

test('forbidden flow: admin without admin.roles.read sees the safe forbidden surface', async ({
  page,
}) => {
  await mockMe(page, principalNoRoles)

  await page.goto('/roles')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Roles')
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
