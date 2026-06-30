import { test, expect } from '@playwright/test'
import { useEnglish } from './_support/e2e'

// Test 1 original: "cold visit diagnoses an HTML admin API response without falling
// into the generic error view". The redirect-to-unreachable path is a client-side
// flow triggered by `invalid_upstream_response` — it requires a live client fetch
// of /api/admin/me that returns HTML. In the SSR layer the me.get.ts handler always
// returns valid JSON (SSR-side), and after hydration the principal is already in
// useState so the client never re-fetches; page.route cannot trigger the redirect.
// The parsing + routing logic is covered by session.store.nuxt.spec.ts (maps
// invalid_upstream_response → api_unreachable) and admin-guard-resolver.spec.ts
// (maps api_unreachable → admin.api-unreachable route). Here we verify the
// destination page SSR-renders cleanly without auth.
test('admin-api-unreachable page renders as a public layout:false page', async ({ page }) => {
  await page.goto('/admin-api-unreachable')
  await expect(page).toHaveURL(/\/admin-api-unreachable$/u)
  await expect(page.getByRole('heading', { name: 'Admin API unreachable' })).toBeVisible()
})

// Test 2 original: "stubbed OIDC admin session reaches dashboard with principal
// evidence". The auth-flow stub (page.route /auth/login → 302 → callback) relied
// on client-side SPA auth that the Nuxt SSR BFF no longer follows; the server-side
// /auth/login route initiates a PKCE exchange with the real backend. The principal
// and dashboard-summary reads are now served SSR-side by the e2e Nitro layer.
// The key security assertion (no OIDC token text in the rendered page) is preserved.
test('authenticated session reaches dashboard; page carries no OIDC tokens', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/dashboard$/u)
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  // e2e layer me.get.ts returns display_name: 'Admin User'
  await expect(page.getByText('Signed in as Admin User')).toBeVisible()
  // Security gate: OIDC tokens must never appear in the SSR-rendered markup
  await expect(page.getByText(/access_token|refresh_token|id_token|Bearer/u)).toHaveCount(0)
})

// Test 3 original: "legacy /home path is handled by the admin SPA catch-all instead
// of rendering blank". The SPA catch-all (serving index.html for every unknown route)
// is gone in Nuxt SSR — /home is a 404. The canonical redirect is / → /dashboard via
// index.vue's navigateTo. We verify that SSR redirect chain here.
test('root path redirects to dashboard via SSR navigateTo', async ({ page }) => {
  await useEnglish(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/u)
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
})
