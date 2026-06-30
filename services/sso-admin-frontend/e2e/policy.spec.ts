import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// Initial GETs are served SSR by the e2e Nitro layer (test/fixtures/e2e):
//   id=2 superseded, id=3 active, id=4 draft — matching the version-select testids below.
// Only mutation routes (POST /activate /rollback) use page.route.

test('propose draft: invalid JSON blocks, valid JSON confirms and POSTs', async ({ page }) => {
  await useEnglish(page)
  let posted: unknown = null
  await page.route('**/api/admin/security-policies/password', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ policy: { id: 5, category: 'password', version: 5, status: 'draft', payload: { min_length: 18 }, effective_at: null, actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K9Q', reason: 'Proposed', created_at: '2026-06-30T10:00:00Z', updated_at: '2026-06-30T10:00:00Z' } }) })
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
  await useEnglish(page)
  let activated = false
  await page.route('**/api/admin/security-policies/password/4/activate', async (r) => {
    activated = true
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ policy: { id: 4, category: 'password', version: 4, status: 'active', payload: { min_length: 16, require_special: true }, effective_at: '2026-06-30T10:00:00Z', actor_subject_id: '01HZX9C7K3Q8VMETBD9R2F4K9Q', reason: 'Proposed stronger baseline.', created_at: '2026-06-28T10:00:00Z', updated_at: '2026-06-30T10:00:00Z' } }) })
  })
  await page.goto('/policy')
  await page.getByTestId('policy-version-select-4').click()
  await page.getByTestId('policy-activate').click()
  await expect(page.getByTestId('privileged-action-impact')).toContainText('4')
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => activated).toBe(true)
})

test('rollback cancel calls no API; rollback is the danger affordance on a superseded version', async ({ page }) => {
  await useEnglish(page)
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
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view'])
  await page.goto('/policy')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
