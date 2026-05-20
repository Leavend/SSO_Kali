import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config — E2E happy path untuk sso-frontend portal.
 *
 * Jalankan:
 *   npx playwright test
 *   npx playwright test --ui   (interactive mode)
 *
 * Prerequisite:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    /*
     * Spawn the production-built BFF (same artefact deployed to staging),
     * not `vite preview`. Vite's dev proxy re-routes /auth/* and /api/*
     * to the BFF on :3000, so `vite preview` cannot serve auth SPA routes
     * without that BFF being up. The built BFF passes `npm run smoke`
     * (SPA fallback + /healthz) and is therefore the closest production
     * stand-in for E2E.
     */
    command: 'npm run build && npm start',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
})
