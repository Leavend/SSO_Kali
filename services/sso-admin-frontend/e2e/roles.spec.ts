import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// SSR reads are served by the e2e Nitro layer (test/fixtures/e2e/server/routes/api/admin/roles/index.get.ts
// + permissions.get.ts). Layer data: Administrator (system, 3 perms), Content Editor (custom, 1 perm,
// 7 users). page.route only intercepts client-side mutations (PUT).

// Content Editor after granting Manage users — used only in the PUT fulfill response.
const updatedContentEditor = {
  id: 2,
  slug: 'content-editor',
  name: 'Content Editor',
  description: 'Custom role for content and user management.',
  is_system: false,
  permissions: [
    { slug: 'admin.users.read', name: 'View users', category: 'Users' },
    { slug: 'admin.users.write', name: 'Manage users', category: 'Users' },
  ],
  user_count: 7,
  users_count: 7,
}

test('matrix high-risk path: toggle a permission, confirm the sync impact summary, PUT fires', async ({
  page,
}) => {
  await useEnglish(page)

  let syncBody: unknown = null
  await page.route('**/api/admin/roles/content-editor/permissions', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    syncBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'req-sync-e2e' },
      body: JSON.stringify({ role: updatedContentEditor }),
    })
  })

  await page.goto('/roles')
  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText('Roles')

  // Layer: Content Editor column and Manage users row render (layer catalog has users.write).
  await expect(page.getByText('Content Editor').first()).toBeVisible()
  await expect(page.getByText('Manage users').first()).toBeVisible()

  // Grant "Manage users" to Content Editor (system role column is a read-only badge, not a switch).
  await page.getByRole('switch', { name: 'Content Editor: Manage users' }).click()

  // Saving the dirty column opens the confirm dialog with the blast-radius impact.
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText(/changes the permission set for 7 users/iu)).toBeVisible()

  // Confirm → the PUT fires with the full pending permission set.
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => syncBody).not.toBeNull()
  expect(syncBody).toMatchObject({
    permission_slugs: expect.arrayContaining(['admin.users.read', 'admin.users.write']),
  })
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('cancel calls no API: dismissing the sync confirm fires no PUT', async ({ page }) => {
  await useEnglish(page)

  let putCalled = false
  await page.route('**/api/admin/roles/content-editor/permissions', async (route) => {
    if (route.request().method() === 'PUT') putCalled = true
    await route.continue()
  })

  await page.goto('/roles')
  await page.getByRole('switch', { name: 'Content Editor: Manage users' }).click()
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByTestId('privileged-action-cancel').click()
  await expect(page.getByTestId('privileged-action-confirm')).toHaveCount(0)
  expect(putCalled).toBe(false)
})

test('system role is protected: no editable switch + no delete in its column', async ({ page }) => {
  await useEnglish(page)

  await page.goto('/roles')
  // System role permission cells are read-only badges, never switches.
  await expect(page.getByRole('switch', { name: 'Administrator: Manage users' })).toHaveCount(0)
  // System role row hides Delete (UX guard; authoritative gate is on the backend).
  const adminRow = page.getByRole('row', { name: /Administrator/u })
  await expect(adminRow.getByRole('button', { name: 'Delete' })).toHaveCount(0)
})

test('forbidden flow: admin without admin.roles.read sees the safe forbidden surface', async ({
  page,
}) => {
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view'])

  await page.goto('/roles')
  await expect(page).toHaveURL(/\/forbidden$/u)
  // /forbidden is layout:false (no admin nav) — assert the forbidden surface itself.
  // useEnglish pins admin_locale=en, so the forbidden surface renders the en catalog.
  await expect(
    page.getByRole('heading', { name: 'This account does not have admin access.' }),
  ).toBeVisible()
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})
