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
      permissions: ['admin.dashboard.view', 'admin.sessions.terminate'],
      capabilities: { 'admin.dashboard.view': true, 'admin.sessions.terminate': true },
      menus: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          required_permission: 'admin.dashboard.view',
          visible: true,
        },
        {
          id: 'sessions',
          label: 'Sessions',
          required_permission: 'admin.sessions.terminate',
          visible: true,
        },
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
const other = {
  session_id: 'sess_other',
  client_id: 'portal',
  subject_id: 'subj_other',
  email: 'bob@dev-sso.local',
  display_name: 'Bob Operator',
  ip_address: '198.51.100.7',
  user_agent: 'Mozilla/5.0',
  created_at: '2026-06-20T10:00:00Z',
  last_activity_at: '2026-06-28T09:00:00Z',
  expires_at: '2026-07-20T10:00:00Z',
}

async function mockMe(page: Page, body: object) {
  await page.route('**/api/admin/me', async (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  )
}
async function mockSessions(page: Page) {
  await page.route('**/api/admin/sessions', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-sessions-e2e' },
      body: JSON.stringify({ sessions: [other] }),
    })
  })
}

test('terminate: drawer confirm revokes a session and refreshes', async ({ page }) => {
  await mockMe(page, principal)
  await mockSessions(page)
  let revoked = false
  await page.route('**/api/admin/sessions/sess_other', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    revoked = true
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        revoked: true,
        session_id: 'sess_other',
        revoked_tokens: 2,
        backchannel_fanout: 1,
      }),
    })
  })
  await page.goto('/sessions')
  await page.getByTestId('session-select-sess_other').click()
  await page.getByTestId('session-terminate').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => revoked).toBe(true)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('cancel calls no API: dismissing the terminate confirm fires no DELETE', async ({ page }) => {
  await mockMe(page, principal)
  await mockSessions(page)
  let called = false
  await page.route('**/api/admin/sessions/sess_other', async (r) => {
    if (r.request().method() === 'DELETE') called = true
    await r.continue()
  })
  await page.goto('/sessions')
  await page.getByTestId('session-select-sess_other').click()
  await page.getByTestId('session-terminate').click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(called).toBe(false)
})

test('forbidden: an admin without sessions.terminate lands on the safe forbidden surface', async ({
  page,
}) => {
  await mockMe(page, readOnly)
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
