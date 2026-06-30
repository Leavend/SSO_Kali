import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

test.beforeEach(async ({ page }) => {
  await useEnglish(page)
})

// session_id from the SSR layer fixture
// (test/fixtures/e2e/server/routes/api/admin/sessions/index.get.ts)
const SENTINEL_SESSION_ID = 'sess_sentinel_handle_01'

test('terminate: drawer confirm revokes a session and refreshes', async ({ page }) => {
  await usePermissions(page, ['admin.dashboard.view', 'admin.sessions.terminate'])
  let revoked = false
  await page.route(`**/api/admin/sessions/${SENTINEL_SESSION_ID}`, async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    revoked = true
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        revoked: true,
        session_id: SENTINEL_SESSION_ID,
        revoked_tokens: 2,
        backchannel_fanout: 1,
      }),
    })
  })
  await page.goto('/sessions')
  await page.getByTestId(`session-select-${SENTINEL_SESSION_ID}`).click()
  await page.getByTestId('session-terminate').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => revoked).toBe(true)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('cancel calls no API: dismissing the terminate confirm fires no DELETE', async ({ page }) => {
  await usePermissions(page, ['admin.dashboard.view', 'admin.sessions.terminate'])
  let called = false
  await page.route(`**/api/admin/sessions/${SENTINEL_SESSION_ID}`, async (r) => {
    if (r.request().method() === 'DELETE') called = true
    await r.continue()
  })
  await page.goto('/sessions')
  await page.getByTestId(`session-select-${SENTINEL_SESSION_ID}`).click()
  await page.getByTestId('session-terminate').click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(called).toBe(false)
})

test('forbidden: an admin without sessions.terminate lands on the safe forbidden surface', async ({
  page,
}) => {
  await usePermissions(page, ['admin.dashboard.view'])
  await page.goto('/sessions')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
