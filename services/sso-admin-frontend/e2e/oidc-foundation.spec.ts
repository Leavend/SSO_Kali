import { test, expect } from '@playwright/test'
import { useEnglish } from './_support/e2e'

test('oidc-foundation page shows the protocol-health panels', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/oidc-foundation')

  await expect(page.getByTestId('oidc-discovery')).toBeVisible()
  await expect(page.getByTestId('oidc-jwks')).toBeVisible()
  await expect(page.getByTestId('oidc-availability')).toBeVisible()
  await expect(page.getByTestId('oidc-consistency')).toBeVisible()
  await expect(page.getByTestId('oidc-catalog')).toBeVisible()
})
