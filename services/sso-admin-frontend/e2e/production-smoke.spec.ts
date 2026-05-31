import { expect, test } from '@playwright/test'

test('cold visit diagnoses an HTML admin API response without falling into the generic error view', async ({
  page,
}) => {
  await page.route('**/api/admin/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body>spa fallback</body></html>',
    })
  })

  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/admin-api-unreachable$/u)
  await expect(
    page.getByRole('heading', { name: 'Admin API tidak mengembalikan JSON yang valid.' }),
  ).toBeVisible()
  await expect(page).not.toHaveURL(/\/admin-error$/u)
})
