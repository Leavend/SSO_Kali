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
    auth_context: { auth_time: null, amr: ['pwd', 'mfa'], acr: 'urn:example:loa:2', mfa_enforced: true, mfa_verified: true },
    permissions: {
      view_admin_panel: true,
      manage_sessions: true,
      permissions: ['admin.dashboard.view', 'admin.security-policy.read', 'admin.security-policy.write', 'admin.security-policy.activate'],
      capabilities: { 'admin.dashboard.view': true, 'admin.security-policy.read': true, 'admin.security-policy.write': true, 'admin.security-policy.activate': true },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'policy', label: 'Security policy', required_permission: 'admin.security-policy.read', visible: true },
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
      permissions: ['admin.dashboard.view'],
      capabilities: { 'admin.dashboard.view': true },
      menus: [{ id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true }],
    },
  },
}
const draft = { id: 4, category: 'password', version: 4, status: 'draft', payload: { min_length: 16 }, effective_at: null, actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K9Q', reason: 'Proposed', created_at: '2026-06-28T10:00:00Z', updated_at: '2026-06-28T10:00:00Z' }
const active = { id: 3, category: 'password', version: 3, status: 'active', payload: { min_length: 14 }, effective_at: '2026-06-20T10:00:00Z', actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K7N', reason: 'Baseline', created_at: '2026-06-20T10:00:00Z', updated_at: '2026-06-20T10:00:00Z' }
const superseded = { ...active, id: 2, version: 2, status: 'superseded' }

async function mockMe(page: Page, body: object) {
  await page.route('**/api/admin/me', async (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }))
}
async function mockPolicies(page: Page) {
  await page.route('**/api/admin/security-policies/password', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-policy-e2e' }, body: JSON.stringify({ category: 'password', active: { min_length: 14 }, policies: [draft, active, superseded] }) })
  })
}

test('propose draft: invalid JSON blocks, valid JSON confirms and POSTs', async ({ page }) => {
  await mockMe(page, principal)
  await mockPolicies(page)
  let posted: unknown = null
  await page.route('**/api/admin/security-policies/password', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ policy: { ...draft, version: 5 } }) })
  })
  await page.goto('/policy')
  await page.getByTestId('policy-draft-payload').fill('{not json')
  await page.getByTestId('policy-draft-submit').click()
  await expect(page.getByTestId('policy-draft-parse-error')).toBeVisible()
  await page.getByTestId('policy-draft-payload').fill('{"min_length":18}')
  await page.getByTestId('policy-draft-submit').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({ payload: { min_length: 18 } })
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('activate: drawer confirm shows impact and POSTs activate for a draft', async ({ page }) => {
  await mockMe(page, principal)
  await mockPolicies(page)
  let activated = false
  await page.route('**/api/admin/security-policies/password/4/activate', async (r) => {
    activated = true
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ policy: { ...draft, status: 'active' } }) })
  })
  await page.goto('/policy')
  await page.getByTestId('policy-version-select-4').click()
  await page.getByTestId('policy-activate').click()
  await expect(page.getByTestId('privileged-action-impact')).toContainText('4')
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => activated).toBe(true)
})

test('rollback cancel calls no API; rollback is the danger affordance on a superseded version', async ({ page }) => {
  await mockMe(page, principal)
  await mockPolicies(page)
  let rolled = false
  await page.route('**/api/admin/security-policies/password/2/rollback', async (r) => { rolled = true; await r.continue() })
  await page.goto('/policy')
  await page.getByTestId('policy-version-select-2').click()
  await page.getByTestId('policy-rollback').click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(rolled).toBe(false)
})

test('forbidden: an admin without security-policy.read lands on the safe forbidden surface', async ({ page }) => {
  await mockMe(page, readOnly)
  await page.goto('/policy')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
