import { expect, test } from '@playwright/test'

// useI18n resolves locale from the `admin_locale` cookie at SSR time (DEFAULT_LOCALE='id');
// set it so SSR renders English and the English-label selectors below match (mirrors e2e/users.spec.ts).
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: 'admin_locale', value: 'en', url: baseURL! }])
})

// Admin principal WITH observability + audit-export + DSR-review capability.
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
      permissions: ['admin.dashboard.view', 'admin.observability.read', 'admin.audit.export', 'admin.dsr.review'],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.observability.read': true,
        'admin.audit.export': true,
        'admin.dsr.review': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'observability', label: 'Observability', required_permission: 'admin.observability.read', visible: true },
      ],
    },
  },
}

// Admin principal WITHOUT admin.observability.read (forbidden-flow case).
const principalNoObservability = {
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

const summary = {
  generated_at: '2026-06-28T14:32:15Z',
  partial: false,
  degraded: [],
  services: [
    { key: 'idp_backend', name: 'IdP Backend', status: 'healthy', summary: 'All checks passing', latency_p95_ms: 84, freshness_seconds: 12 },
  ],
  metrics: { window_seconds: 86400, queue: { pending_jobs: 2, failed_jobs: 0, oldest_pending_age_seconds: 9 }, auth_funnel: { attempts: 1840, succeeded: 1795, denied: 45 }, admin_activity: { actions: 320 } },
  freshness: { recent_events_seconds: 30 },
  logs: [{ id: 'log-aurora-7', service: 'idp_backend', severity: 'info', message: 'Authorization code issued', reference: 'evt-7c2a', occurred_at: '2026-06-28T14:31:50Z' }],
  traces: { status: 'unavailable', reason: 'No tracing backend configured', last_seen_trace_id: null },
}

const retention = {
  generated_at: '2026-06-28T14:32:15Z',
  items: [
    { category: 'authentication_audit_events', label: 'Authentication audit events', window: { days: 90 }, cutoff: '2026-03-30T00:00:00Z', schedule: 'daily', candidate_count: 3, last_pruned_at: '2026-06-28T00:10:00Z', last_pruned_count: 12 },
  ],
}

const dsr = {
  request_id: '01HX0K7P9MQA2BN4TC6VD8SEFG',
  subject_id: 'sub-dsr-aurora',
  type: 'export',
  status: 'submitted',
  reason: null,
  reviewer_subject_id: 'sub-reviewer-atlas',
  reviewer_notes: null,
  submitted_at: '2026-06-27T09:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-07-27T09:00:00Z',
}

async function mockMe(page, body) {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function mockObservabilityData(page) {
  await page.route('**/api/admin/observability/summary', async (route) => {
    await route.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-obs-e2e' }, body: JSON.stringify(summary) })
  })
  await page.route('**/api/admin/audit/retention', async (route) => {
    await route.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-obs-e2e' }, body: JSON.stringify({ retention }) })
  })
  await page.route('**/api/admin/data-subject-requests*', async (route) => {
    await route.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-obs-e2e' }, body: JSON.stringify({ requests: [dsr] }) })
  })
}

test('legacy redirects: /audit → /observability and /audit/compliance → /observability/compliance', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)

  await page.goto('/audit')
  await expect(page).toHaveURL(/\/observability$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Observability')
  await expect(page.getByText('IdP Backend')).toBeVisible()

  await page.goto('/audit/compliance')
  await expect(page).toHaveURL(/\/observability\/compliance$/u)
  await expect(page.getByText('Authentication audit events')).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.observability.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, principalNoObservability)

  await page.goto('/observability')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).not.toContainText('Observability')
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('audit export: privileged blob download yields a file with the backend Content-Disposition filename', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)
  await page.route('**/api/admin/audit/export*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: {
        'content-disposition': 'attachment; filename="admin-audit-events-2026-06-28.csv"',
        'x-request-id': 'req-export-e2e',
      },
      body: 'event_id,action,outcome\nAUD01,admin.user.lock,succeeded\n',
    })
  })

  await page.goto('/observability/compliance')

  // Export is a privileged action: open the confirm dialog (no API), then Confirm runs getBlob.
  await page.getByRole('button', { name: 'Export' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Confirm' }).click()
  const download = await downloadPromise
  // The download attribute is set from the backend Content-Disposition filename.
  expect(download.suggestedFilename()).toBe('admin-audit-events-2026-06-28.csv')
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('audit export: a step-up (428) failure surfaces safe copy + redacted REF and triggers no download', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)
  let downloadFired = false
  page.on('download', () => {
    downloadFired = true
  })
  await page.route('**/api/admin/audit/export*', async (route) => {
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-stepup-e2e' },
      body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
    })
  })

  await page.goto('/observability/compliance')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  // The shipped affordance is the "Re-authenticate" re-auth LINK (observability.btn_step_up)
  // pointing at the backend step_up_url — assert the link + its href, NOT invented
  // "step-up/MFA assurance" copy that no component renders. Plus the redacted REF;
  // never the raw backend trace, never a file.
  const reauth = page.getByRole('link', { name: 'Re-authenticate' })
  await expect(reauth).toBeVisible()
  await expect(reauth).toHaveAttribute('href', '/step-up-required')
  await expect(page.getByText('REF-TEPUPE2E').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
  expect(downloadFired).toBe(false)
})

test('DSR review: a step-up (428) failure surfaces the re-auth link to step_up_url with no list refresh', async ({ page }) => {
  await mockMe(page, principal)
  await mockObservabilityData(page)
  let reviewCalls = 0
  await page.route('**/api/admin/data-subject-requests/*/review', async (route) => {
    reviewCalls += 1
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-dsr-stepup' },
      body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
    })
  })

  await page.goto('/observability/compliance')

  // Open the review drawer from the submitted DSR row, approve, add notes, confirm.
  await page.getByRole('button', { name: 'Review' }).first().click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await page.getByLabel('Reviewer notes').fill('Verified subject identity per policy')
  await page.getByRole('button', { name: 'Confirm' }).click()

  // The shipped DSR step-up affordance is the "Re-authenticate to continue" LINK
  // (observability.dsr_step_up_label) to the backend step_up_url — assert the link
  // + href, plus the redacted REF; never the raw trace.
  const reauth = page.getByRole('link', { name: 'Re-authenticate to continue' })
  await expect(reauth).toBeVisible()
  await expect(reauth).toHaveAttribute('href', '/step-up-required')
  await expect(page.getByText('REF-SRSTEPUP').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
  // The review POST was attempted once and failed; the list is NOT refreshed on failure.
  expect(reviewCalls).toBe(1)
})
