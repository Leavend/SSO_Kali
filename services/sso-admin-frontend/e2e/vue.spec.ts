import { test, expect } from '@playwright/test'

// layout:false public pages — no auth layer; cookie-less visits render the
// default locale (id) catalog copy. Both carry an ABSOLUTE escape link to the
// SSO portal so a gated admin is not trapped here.

test('renders the forbidden page with an absolute portal escape link', async ({ page }) => {
  await page.goto('/forbidden')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Akun ini belum memiliki akses admin.',
  )
  const portalLink = page.getByRole('link', { name: 'Kembali ke Portal SSO' })
  await expect(portalLink).toBeVisible()
  // Absolute https URL — a relative href would dead-end the admin on this origin.
  await expect(portalLink).toHaveAttribute('href', /^https:\/\/[^/]+\/home$/u)
})

test('renders the admin error page with an absolute portal escape link', async ({ page }) => {
  await page.goto('/admin-error')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Terjadi Kesalahan')
  const portalLink = page.getByRole('link', { name: 'Kembali ke Portal SSO' })
  await expect(portalLink).toHaveAttribute('href', /^https:\/\/[^/]+\/home$/u)
})
