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
      permissions: ['admin.dashboard.view', 'admin.observability.read', 'admin.dsr.read', 'admin.dsr.review'],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.observability.read': true,
        'admin.dsr.read': true,
        'admin.dsr.review': true,
      },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'observability',
          label: 'Observability',
          required_permission: 'admin.observability.read',
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

const event = {
  event_id: 'AUD01',
  action: 'admin.user.lock',
  outcome: 'succeeded',
  taxonomy: 'user_lifecycle',
  actor: { subject_id: 'sub_admin', email: 'admin@example.test', role: 'admin' },
  request: { method: 'POST', path: '/admin/api/users/sub_target/lock', ip_address: '203.0.113.10' },
  reason: 'Security review',
  context: { token: '[redacted]', subject_id: 'sub_target' },
  hash_chain: { previous_hash: 'prev-hash', event_hash: 'event-hash' },
  occurred_at: '2026-05-27T00:00:00Z',
}

const authEvent = {
  event_id: 'AUTH01',
  event_type: 'refresh_token_reuse_detected',
  outcome: 'failed',
  subject: { subject_id: 'sub_target', email: 'target@example.test' },
  client_id: 'prototype-app-a',
  session_id: 'sid-123',
  request: {
    ip_address: '203.0.113.40',
    user_agent: 'Test Browser',
    request_id: 'req-auth-event-1',
  },
  error_code: 'refresh_token_reuse_detected',
  context: { token: '[redacted]', notification: 'queued' },
  occurred_at: '2026-05-27T00:00:00Z',
}

const dsr = {
  request_id: '01HX7S8Y9ZABCDEF1234567890',
  subject_id: 'sub_target',
  type: 'export',
  status: 'submitted',
  reason: 'Privacy request',
  reviewer_subject_id: null,
  reviewer_notes: null,
  submitted_at: '2026-05-27T00:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-26T00:00:00Z',
}

const retention = {
  generated_at: '2026-05-31T00:00:00Z',
  items: [
    {
      category: 'authentication_audit_events',
      label: 'Authentication audit events',
      window: { days: 90 },
      cutoff: '2026-03-02T00:00:00Z',
      schedule: 'daily',
      candidate_count: 3,
      last_pruned_at: '2026-05-31T00:10:00Z',
      last_pruned_count: 12,
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('dev-sso-admin-locale', 'en')
  })
})

test('renders audit compliance evidence and DSR queue', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/audit/events*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-e2e' },
      body: JSON.stringify({ events: [event] }),
    })
  })
  await page.route('**/api/admin/audit/authentication-events*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-e2e' },
      body: JSON.stringify({ events: [authEvent] }),
    })
  })
  await page.route('**/api/admin/audit/integrity', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-e2e' },
      body: JSON.stringify({ integrity: { verified: true, checked_events: 1 } }),
    })
  })
  await page.route('**/api/admin/audit/retention', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-e2e' },
      body: JSON.stringify({ retention }),
    })
  })
  await page.route('**/api/admin/data-subject-requests*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-e2e' },
      body: JSON.stringify({ requests: [dsr] }),
    })
  })

  await page.goto('/observability/compliance')

  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Observability')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Audit Compliance' })).toBeVisible()
  // Logs tab (active by default)
  await expect(page.getByText('AUD01')).toBeVisible()

  // Click Retention tab
  await page.getByRole('button', { name: 'Retention & Integrity' }).click()
  await expect(page.getByText('Integrity verified')).toBeVisible()
  await expect(page.getByText('Retention status')).toBeVisible()

  // Click DSR tab
  await page.getByRole('button', { name: 'DSR Queue' }).click()
  await expect(page.getByText('REF-34567890')).toBeVisible()

  // Click Security tab
  await page.getByRole('button', { name: 'Security Notification' }).click()
  await expect(page.getByText('Security notification evidence')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'REF-AUTH01' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'refresh_token_reuse_detected' })).toBeVisible()
  await expect(page.getByText('Suspicious login challenge matrix')).toBeVisible()
  await expect(page.getByText('Unknown ACR values are treated as no requirement')).toBeVisible()
  await expect(page.getByText('Portal/backend observable evidence')).toBeVisible()
  await expect(page.getByText('Consent revocation audit viewer')).toBeVisible()
  await expect(page.getByText('Legacy portal session fallback sunset')).toBeVisible()
  await expect(page.getByText('Token lifetime production guard')).toBeVisible()
  await expect(page.getByText('Session / logout evidence console')).toBeVisible()
  await expect(page.getByText('Safe error regression review')).toBeVisible()
  const evidencePanel = page.getByRole('heading', { name: 'Audit evidence context' }).locator('..')
  await expect(evidencePanel).toBeVisible()
  await expect(evidencePanel).toContainText('Reference code')
  await expect(evidencePanel).toContainText('REF-AUDITE2E')
  await expect(evidencePanel).toContainText('Correlation')
  await expect(evidencePanel).toContainText('Session')
  await expect(page.getByText(/Bearer|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('shows safe audit error with request evidence', async ({ page }) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(principal) })
  })
  await page.route('**/api/admin/audit/events*', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-fail' },
      body: JSON.stringify({ error: 'server_error', message: 'SQLSTATE leaked audit trace' }),
    })
  })
  await page.route('**/api/admin/audit/authentication-events*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-fail' },
      body: JSON.stringify({ events: [] }),
    })
  })
  await page.route('**/api/admin/audit/integrity', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-fail' },
      body: JSON.stringify({ integrity: {} }),
    })
  })
  await page.route('**/api/admin/audit/retention', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-fail' },
      body: JSON.stringify({ retention: { generated_at: null, items: [] } }),
    })
  })
  await page.route('**/api/admin/data-subject-requests*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-audit-fail' },
      body: JSON.stringify({ requests: [] }),
    })
  })

  await page.goto('/observability/compliance')

  await expect(
    page.getByRole('heading', { name: 'Admin audit events' }),
  ).toBeVisible()
  await expect(page.getByRole('alert').first()).toContainText('REF-UDITFAIL')
  await expect(page.getByText('SQLSTATE')).toHaveCount(0)
})
