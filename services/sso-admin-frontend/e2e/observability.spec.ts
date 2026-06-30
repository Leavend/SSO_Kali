import { test, expect } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// SSR reads are served by the e2e Nitro layer (test/fixtures/e2e).
// Mutations (audit export, DSR review) are client-side: page.route intercepts them.
// The default layer principal carries admin.audit.export + admin.dsr.review so both
// panels are visible without scoping.

test('legacy redirects: /audit → /observability and /audit/compliance → /observability/compliance', async ({ page }) => {
  await useEnglish(page)

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
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view'])

  await page.goto('/observability')
  await expect(page).toHaveURL(/\/forbidden$/u)
  // /forbidden is layout:false (no admin nav) — assert the forbidden surface itself.
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('audit export: privileged blob download yields a file with the backend Content-Disposition filename', async ({ page }) => {
  await useEnglish(page)
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
  await useEnglish(page)
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
  await useEnglish(page)
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
