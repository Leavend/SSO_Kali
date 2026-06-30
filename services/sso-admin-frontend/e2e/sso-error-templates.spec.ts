import { expect, test } from '@playwright/test'
import { useEnglish, usePermissions } from './_support/e2e'

// SSR initial GETs (/api/admin/sso-error-templates?locale=id and ?locale=en) are served
// by test/fixtures/e2e/server/routes/api/admin/sso-error-templates/index.get.ts.
// Layer returns access_denied in both locales (merged into two rows by the composable).
// Mutations (PATCH /access_denied, POST /access_denied/reset) are client-side and
// intercepted via page.route; the method guard passes non-matching methods to the layer.

test('lists edits and resets SSO error templates', async ({ page }) => {
  await useEnglish(page)

  let patched: unknown = null
  let resetPosted = false

  await page.route('**/api/admin/sso-error-templates/access_denied', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    patched = route.request().postDataJSON()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        template: {
          error_code: 'access_denied',
          locale: 'en',
          title: 'Access denied (updated)',
          message: 'Contact your administrator for help.',
          action_label: 'Back',
          action_url: 'https://sso.example/help',
          retry_allowed: false,
          alternative_login_allowed: true,
          is_enabled: true,
        },
      }),
    })
  })
  await page.route('**/api/admin/sso-error-templates/access_denied/reset', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    resetPosted = true
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        template: {
          error_code: 'access_denied',
          locale: 'en',
          title: 'Access denied',
          message: 'You do not have access to this application. Contact your administrator.',
          action_label: 'Back to sign-in',
          action_url: 'https://sso.example/help',
          retry_allowed: false,
          alternative_login_allowed: true,
          is_enabled: true,
        },
      }),
    })
  })

  await page.goto('/sso-error-templates')

  await expect(page.getByRole('navigation', { name: 'Admin modules' })).toContainText(
    'SSO Error Templates',
  )
  await expect(page.getByRole('heading', { name: 'SSO Error Templates' })).toBeVisible()
  // Layer serves access_denied in both locales; the en row title is 'Access denied'.
  await expect(page.getByText('Access denied').first()).toBeVisible()

  // Select the English variant to open the detail drawer.
  await page.getByTestId('sso-templates-select-access_denied::en').click()
  await expect(page.getByTestId('sso-template-detail')).toBeVisible()

  // Open the edit form and update the template.
  await page.getByTestId('sso-template-edit').click()
  await page.getByTestId('sso-template-field-title').fill('Access denied (updated)')
  await page.getByTestId('sso-template-field-message').fill('Contact your administrator for help.')
  await page.getByTestId('sso-template-field-action_label').fill('Back')
  await page.getByTestId('sso-template-form-submit').click()

  await expect.poll(() => patched).not.toBeNull()
  expect(patched).toMatchObject({ title: 'Access denied (updated)' })
  // Success banner is set before the post-save refresh; persist until next row selection.
  await expect(page.getByTestId('sso-templates-action-success')).toContainText('updated')

  // Re-select the row for the reset flow (onSelect clears the success banner).
  await page.getByTestId('sso-templates-select-access_denied::en').click()
  await page.getByTestId('sso-template-reset').click()
  await page.getByTestId('privileged-action-confirm').click()

  await expect.poll(() => resetPosted).toBe(true)
  await expect(page.getByTestId('sso-templates-action-success')).toContainText('reset')
  await expect(page.getByText(/Bearer|refreshToken|SQLSTATE/u)).toHaveCount(0)
})

test('hides SSO error template write controls without write permission', async ({ page }) => {
  await useEnglish(page)
  await usePermissions(page, ['admin.security-policy.read'])

  await page.goto('/sso-error-templates')

  // Layer serves access_denied templates; page loads in read-only mode.
  await expect(page.getByText('Access denied').first()).toBeVisible()
  // Open the drawer to prove edit/reset are absent even with a row selected.
  await page.getByTestId('sso-templates-select-access_denied::en').click()
  await expect(page.getByTestId('sso-template-detail')).toBeVisible()
  await expect(page.getByTestId('sso-template-edit')).toHaveCount(0)
  await expect(page.getByTestId('sso-template-reset')).toHaveCount(0)
})

test('blocks SSO error templates route without security policy read permission', async ({
  page,
}) => {
  await useEnglish(page)
  await usePermissions(page, ['admin.dashboard.view'])

  await page.goto('/sso-error-templates')

  // Admin guard redirects to /forbidden when admin.security-policy.read is absent.
  await expect(page).toHaveURL(/\/forbidden$/u)
  await expect(page.getByText(/Bearer|access_token|client_secret|SQLSTATE/u)).toHaveCount(0)
})

test('shows safe step-up link when saving SSO error template needs fresh auth', async ({
  page,
}) => {
  await useEnglish(page)

  // 428 with step_up_url → the form surfaces the re-verify CTA, never the raw message.
  await page.route('**/api/admin/sso-error-templates/access_denied', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    await route.fulfill({
      status: 428,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'fresh_auth_required',
        message: 'raw ACR trace',
        step_up_url: 'https://sso.example/step-up?return_to=/',
      }),
    })
  })

  await page.goto('/sso-error-templates')
  await page.getByTestId('sso-templates-select-access_denied::en').click()
  await page.getByTestId('sso-template-edit').click()
  await page.getByTestId('sso-template-field-title').fill('Access denied updated')
  await page.getByTestId('sso-template-form-submit').click()

  // Step-up link visible; raw backend message is suppressed (safe copy policy).
  await expect(page.getByTestId('sso-template-form-stepup')).toBeVisible()
  await expect(page.getByText('raw ACR')).toHaveCount(0)
})
