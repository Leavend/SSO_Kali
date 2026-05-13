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
    baseURL: 'http://localhost:4173',
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
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env['CI'],
    timeout: 10_000,
  },
})
