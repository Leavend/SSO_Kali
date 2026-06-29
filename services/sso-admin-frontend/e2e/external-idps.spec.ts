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
      permissions: [
        'admin.dashboard.view',
        'admin.external-idps.read',
        'admin.external-idps.write',
        'admin.sessions.terminate',
      ],
      capabilities: {
        'admin.dashboard.view': true,
        'admin.external-idps.read': true,
        'admin.external-idps.write': true,
        'admin.sessions.terminate': true,
      },
      menus: [
        { id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true },
        { id: 'external-idps', label: 'External IdP', required_permission: 'admin.external-idps.read', visible: true },
      ],
    },
  },
}
const readOnly = {
  principal: {
    ...principal.principal,
    permissions: { view_admin_panel: true, manage_sessions: false, permissions: ['admin.dashboard.view'], capabilities: { 'admin.dashboard.view': true }, menus: [{ id: 'dashboard', label: 'Dashboard', required_permission: 'admin.dashboard.view', visible: true }] },
  },
}
const provider = { provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://idp.acme.test', metadata_url: 'https://idp.acme.test/m', client_id: 'sso-client', enabled: true, has_client_secret: true, health_status: 'healthy' }

async function mockMe(page: Page, body: object) {
  await page.route('**/api/admin/me', async (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }))
}
async function mockList(page: Page) {
  await page.route('**/api/admin/external-idps', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    await r.fulfill({ contentType: 'application/json', headers: { 'x-request-id': 'req-idp-e2e' }, body: JSON.stringify({ providers: [provider] }) })
  })
}

test('create: open the form, submit, POST fires', async ({ page }) => {
  await mockMe(page, principal)
  await mockList(page)
  let posted: unknown = null
  await page.route('**/api/admin/external-idps', async (r) => {
    if (r.request().method() !== 'POST') return r.continue()
    posted = r.request().postDataJSON()
    await r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ provider: { ...provider, provider_key: 'newidp', display_name: 'New IdP' } }) })
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
  await mockMe(page, principal)
  await mockList(page)
  let deleted = false
  await page.route('**/api/admin/external-idps/acme', async (r) => {
    if (r.request().method() !== 'DELETE') return r.continue()
    deleted = true
    await r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/external-idps')
  await page.getByTestId('external-idp-select-acme').click()
  await page.getByTestId('external-idp-delete').click()
  await page.getByTestId('privileged-action-cancel').click()
  expect(deleted).toBe(false)
  await page.getByTestId('external-idp-select-acme').click()
  await page.getByTestId('external-idp-delete').click()
  await page.getByTestId('privileged-action-confirm').click()
  await expect.poll(() => deleted).toBe(true)
})

test('forbidden: an admin without external-idps.read sees the safe forbidden surface', async ({ page }) => {
  await mockMe(page, readOnly)
  await page.goto('/external-idps')
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret/u)).toHaveCount(0)
})
