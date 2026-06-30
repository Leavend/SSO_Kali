import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// Initial-load GET /api/admin/external-idps is served SSR by the e2e Nitro layer
// (test/fixtures/e2e/server/routes/api/admin/external-idps/index.get.ts).
// Mutation routes (POST, DELETE) are client-side — page.route intercepts them.
// The post-delete refresh() GET is also client-side and hits the layer directly.

test('create: open the form, submit, POST fires', async ({ page }) => {
  await useEnglish(page)
  // ponytail: no mockMe/mockList — layer provides full perms + sentinel-fed/acme-backup via SSR
  let posted: unknown = null
  await page.route('**/api/admin/external-idps', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: {
          provider_key: 'newidp',
          display_name: 'New IdP',
          issuer: 'https://new.test',
          metadata_url: 'https://new.test/m',
          client_id: 'newclient',
          enabled: true,
          has_client_secret: true,
          health_status: 'healthy',
        },
      }),
    })
  })
  await page.goto('/external-idps')
  await page.getByTestId('external-idps-create').click()
  await page.getByTestId('idp-field-provider_key').fill('newidp')
  await page.getByTestId('idp-field-display_name').fill('New IdP')
  await page.getByTestId('idp-field-issuer').fill('https://new.test')
  await page.getByTestId('idp-field-metadata_url').fill('https://new.test/m')
  await page.getByTestId('idp-field-client_id').fill('newclient')
  await page.getByTestId('idp-field-client_secret').fill('s3cret')
  await page.getByTestId('external-idp-form-submit').click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({ provider_key: 'newidp' })
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})

test('delete: drawer danger confirm fires DELETE; cancel calls no API', async ({ page }) => {
  await useEnglish(page)
  // ponytail: layer seeds sentinel-fed — align delete target to that provider_key
  let deleted = false
  await page.route('**/api/admin/external-idps/sentinel-fed', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    deleted = true
    await r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/external-idps')
  await page.getByTestId('external-idp-select-sentinel-fed').click()
  await page.getByTestId('external-idp-delete').click()
  await page.getByTestId('privileged-action-cancel').click()
  expect(deleted).toBe(false)
  // The detail drawer stays open after a cancelled confirm — re-open the confirm
  // from the still-open drawer (re-clicking the table row would be covered by it).
  await page.getByTestId('external-idp-delete').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => deleted).toBe(true)
})

test('forbidden: an admin without external-idps.read sees the safe forbidden surface', async ({
  page,
}) => {
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view'])
  await page.goto('/external-idps')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})
