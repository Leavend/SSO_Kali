import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// SSR reads are served by the e2e Nitro layer (test/fixtures/e2e):
//   - /api/admin/users       → server/routes/api/admin/users/index.get.ts
//   - /api/admin/users/[id]  → server/routes/api/admin/users/[subjectId].get.ts
//   - /api/admin/roles       → server/routes/api/admin/roles/index.get.ts
//   - /api/admin/me          → server/routes/api/admin/me.get.ts (full perms default)
// page.route() is kept only for MUTATION calls (POST) and the 428 step-up path.

test.beforeEach(async ({ page }) => {
  await useEnglish(page)
})

test('critical navigation: list → deep-linked detail with masked PII, no token', async ({ page }) => {
  await page.goto('/users')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Users')
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page.getByText('Target User')).toBeVisible()

  // Navigation is via the View button (UsersTable emits select → navigateTo).
  // The layer fixture uses subject_id 'sub-target-sentinel' (index.get.ts).
  await page.getByTestId('users-row-view').click()
  await expect(page).toHaveURL(/\/users\/sub-target-sentinel$/u)
  await expect(page.getByRole('heading', { name: 'Target User' })).toBeVisible()
  // Masked identifier is rendered; no raw 16/18/10-digit PII, no token.
  await expect(page.getByText('3174********4321')).toBeVisible()
  await expect(page.getByText(/\b\d{16}\b|\b\d{18}\b|\b\d{10}\b/u)).toHaveCount(0)
  await expect(page.getByText(/Bearer|access_token|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('forbidden flow: admin without admin.users.read sees the safe forbidden surface', async ({ page }) => {
  // Scope the principal to dashboard.view only — users.read is absent.
  await usePermissions(page, ['admin.dashboard.view'])

  await page.goto('/users')
  await expect(page).toHaveURL(/\/forbidden$/u)
  // forbidden page uses layout:false — no admin nav is present at all.
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toHaveCount(0)
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})

test('role assignment: high-risk path succeeds and surfaces safe step-up on 428', async ({ page }) => {
  // Layer serves the user detail and roles list (SSR). Role catalog from
  // roles/index.get.ts: Administrator + Content Editor (no Pegawai).
  // page.route only intercepts the POST mutation (client-side).

  let assignAttempt = 0
  await page.route('**/api/admin/users/sub_target/roles', async (route) => {
    assignAttempt += 1
    if (assignAttempt === 1) {
      await route.fulfill({
        status: 428,
        contentType: 'application/json',
        headers: { 'x-request-id': 'req-stepup-e2e' },
        body: JSON.stringify({ error: 'step_up_required', message: 'raw ACR failure trace', step_up_url: '/step-up-required' }),
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-assign-e2e' },
      body: JSON.stringify({
        user: { subject_id: 'sub_target', email: 'target.user@example.test', display_name: 'Target User', role: 'content-editor', status: 'active', roles: [{ slug: 'content-editor', name: 'Content Editor', is_system: false }] },
      }),
    })
  })

  await page.goto('/users/sub_target')

  // High-risk path #1: backend demands step-up — safe copy, redacted ref, no raw trace.
  await page.getByRole('radio', { name: 'Content Editor' }).check()
  await page.getByRole('button', { name: 'Save Role' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/step-up|MFA assurance/u)).toBeVisible()
  await expect(page.getByText('REF-TEPUPE2E').first()).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)

  // High-risk path #2: retry succeeds.
  await page.getByRole('button', { name: 'Save Role' }).click()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Content Editor')).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|SQLSTATE/u)).toHaveCount(0)
})
