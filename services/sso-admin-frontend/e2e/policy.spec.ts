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
      permissions: ['admin.dashboard.view', 'admin.security-policy.read', 'admin.roles.read'],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.security-policy.read': true,
        'admin.roles.read': true,
      },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'policy',
          label: 'Policy',
          required_permission: 'admin.security-policy.read',
          visible: true,
        },
      ],
    },
  },
}

const policy = {
  id: 1,
  category: 'password',
  version: 1,
  status: 'active',
  payload: { min_length: 12 },
  effective_at: '2026-05-27T00:00:00Z',
  activated_at: '2026-05-27T00:00:00Z',
  superseded_at: null,
  actor_subject_id: 'sub_admin',
  reason: 'Baseline',
  created_at: '2026-05-27T00:00:00Z',
  updated_at: '2026-05-27T00:00:00Z',
}

const role = {
  id: 1,
  slug: 'auditor',
  name: 'Auditor',
  description: 'Audit read-only',
  is_system: true,
  users_count: 2,
  permissions: [{ slug: 'admin.audit.read', name: 'Audit read', category: 'audit' }],
}

test('renders policy and RBAC evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/security-policies/password', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-policy-e2e' },
      body: JSON.stringify({ category: 'password', active: policy.payload, policies: [policy] }),
    })
  })
  await page.route('**/api/admin/roles', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-policy-e2e' },
      body: JSON.stringify({ roles: [role] }),
    })
  })
  await page.route('**/api/admin/permissions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-policy-e2e' },
      body: JSON.stringify({ permissions: role.permissions }),
    })
  })

  await page.goto('/policy')

  await expect(page.getByRole('navigation', { name: 'Modul admin' })).toContainText('Policy')
  await expect(page.getByRole('heading', { name: 'Policy & RBAC' })).toBeVisible()
  await expect(page.getByText('password version 1')).toBeVisible()
  const roles = page.getByRole('heading', { name: 'Roles' }).locator('..')
  await expect(roles).toContainText('Auditor')
  await expect(roles).toContainText('admin.audit.read')
  await expect(page.getByText('Policy evidence')).toBeVisible()
  await expect(page.getByText('Request ID')).toBeVisible()
  await expect(page.getByText('req-policy-e2e')).toBeVisible()
  await expect(page.getByText(/Bearer|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('shows safe step-up copy for high-risk policy action', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/security-policies/password', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-policy-step' },
      body: JSON.stringify({ category: 'password', active: policy.payload, policies: [policy] }),
    })
  })
  await page.route('**/api/admin/roles', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ roles: [role] }),
    })
  })
  await page.route('**/api/admin/permissions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ permissions: role.permissions }),
    })
  })
  await page.route('**/api/admin/security-policies/password/1/activate', async (route) => {
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-policy-step' },
      body: JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR trace' }),
    })
  })

  await page.goto('/policy')
  await page.getByRole('button', { name: 'Activate' }).click()

  await expect(page.getByText('fresh-auth atau MFA assurance')).toBeVisible()
  await expect(page.getByText('req-policy-step')).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
