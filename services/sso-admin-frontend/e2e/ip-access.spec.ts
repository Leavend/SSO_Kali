import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// SSR initial load is served by test/fixtures/e2e/server/routes/api/admin/ip-access-rules/index.get.ts
// (rule id:1 cidr 203.0.113.0/24 mode block). page.route only intercepts client-side mutations.

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

test('table: renders the IP access rules list with CIDR + mode label', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/ip-access')
  // The row's CIDR select button proves the table mounted (no table-level testid).
  await expect(page.getByTestId('ip-access-select-1')).toBeVisible()
  await expect(page.getByText('203.0.113.0/24')).toBeVisible()
  // mode badge renders a text label (never colour-only per Swiss rule).
  await expect(page.getByText('Block').first()).toBeVisible()
  // Add button visible; default full perms include admin.ip-access.write.
  await expect(page.getByTestId('ip-access-create')).toBeVisible()
})

test('create: open the form, submit, POST fires', async ({ page }) => {
  await useEnglish(page)
  let posted: unknown = null
  await page.route('**/api/admin/ip-access-rules', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ rule: { ...rule, id: 2, cidr: '198.51.100.0/24', mode: 'allow' } }),
    })
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
  await useEnglish(page)
  let deleted = false
  await page.route('**/api/admin/ip-access-rules/1', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    deleted = true
    await r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/ip-access')
  // Delete lives inside the detail drawer — select the rule first to open it.
  await page.getByTestId('ip-access-select-1').click()
  await page.getByTestId('ip-access-delete').click()
  await page.getByTestId('privileged-action-cancel').click()
  expect(deleted).toBe(false)
  await page.getByTestId('ip-access-delete').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => deleted).toBe(true)
})

test('forbidden: an admin without ip-access.read sees the safe forbidden surface', async ({ page }) => {
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view'])
  await page.goto('/ip-access')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})

test('read-only: Add button hidden when admin has read but not write', async ({ page }) => {
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view', 'admin.ip-access.read'])
  await page.goto('/ip-access')
  await expect(page.getByText('203.0.113.0/24')).toBeVisible()
  await expect(page.getByTestId('ip-access-create')).toHaveCount(0)
})
