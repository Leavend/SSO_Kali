// RUN DEFERRED to Phase 18 — playwright.config.ts still targets the legacy SPA.
import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

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
        'admin.ip-access.read',
        'admin.ip-access.write',
        'admin.sessions.terminate',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.ip-access.read': true,
        'admin.ip-access.write': true,
        'admin.sessions.terminate': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'ip-access', label: 'IP Access', required_permission: 'admin.ip-access.read', visible: true },
      ],
    },
  },
}
const readOnly = {
  principal: {
    ...principal.principal,
    permissions: {
      view_admin_panel: true,
      manage_sessions: false,
      permissions: ['admin.dashboard.view', 'admin.ip-access.read'],
      capabilities: { 'admin.dashboard.view': true, 'admin.ip-access.read': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'ip-access', label: 'IP Access', required_permission: 'admin.ip-access.read', visible: true },
      ],
    },
  },
}
const rule = {
  id: 1,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'Blocked maintenance range',
  expires_at: null,
  actor_subject_id: 'sub-admin-sentinel',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}

async function mockMe(page: Page, body: object): Promise<void> {
  await page.route('**/api/admin/me', async (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }))
}
async function mockList(page: Page): Promise<void> {
  await page.route('**/api/admin/ip-access-rules', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-ip-e2e' }, body: JSON.stringify({ rules: [rule] }) })
  })
}

test('table: renders the IP access rules list with CIDR + mode label', async ({ page }) => {
  await mockMe(page, principal)
  await mockList(page)
  await page.goto('/ip-access')
  await expect(page.getByTestId('ip-access-table')).toBeVisible()
  await expect(page.getByText('203.0.113.0/24')).toBeVisible()
  // mode badge renders a text label (never colour-only per Swiss rule).
  await expect(page.getByText('Block')).toBeVisible()
  // Add button visible for write principal.
  await expect(page.getByTestId('ip-access-create')).toBeVisible()
})

test('create: open the form, submit, POST fires', async ({ page }) => {
  await mockMe(page, principal)
  await mockList(page)
  let posted: unknown = null
  await page.route('**/api/admin/ip-access-rules', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ rule: { ...rule, id: 2, cidr: '198.51.100.0/24', mode: 'allow' } }) })
  })
  await page.goto('/ip-access')
  await page.getByTestId('ip-access-create').click()
  await page.getByTestId('ip-access-field-cidr').fill('198.51.100.0/24')
  await page.getByTestId('ip-access-field-mode').selectOption('allow')
  await page.getByTestId('ip-access-field-reason').fill('Office egress range')
  await page.getByTestId('ip-access-form-submit').click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({ cidr: '198.51.100.0/24', mode: 'allow' })
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})

test('delete: double-gate confirm fires DELETE; cancel calls no API', async ({ page }) => {
  await mockMe(page, principal)
  await mockList(page)
  let deleted = false
  await page.route('**/api/admin/ip-access-rules/1', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    deleted = true
    await r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/ip-access')
  await page.getByTestId('ip-access-delete-1').click()
  await page.getByTestId('privileged-action-cancel').click()
  expect(deleted).toBe(false)
  await page.getByTestId('ip-access-delete-1').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => deleted).toBe(true)
})

test('forbidden: an admin without ip-access.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, { principal: { ...principal.principal, permissions: { view_admin_panel: true, manage_sessions: false, permissions: ['admin.dashboard.view'], capabilities: { 'admin.dashboard.view': true }, menus: [{ id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true }] } } })
  await page.goto('/ip-access')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})

test('read-only: Add button hidden when admin has read but not write', async ({ page }) => {
  await mockMe(page, readOnly)
  await mockList(page)
  await page.goto('/ip-access')
  await expect(page.getByText('203.0.113.0/24')).toBeVisible()
  await expect(page.getByTestId('ip-access-create')).toHaveCount(0)
})
