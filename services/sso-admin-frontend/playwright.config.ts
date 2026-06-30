import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// The e2e Nuxt LAYER (test/fixtures/e2e) extends the app and serves /api/admin/*
// mock reads server-side, so real SSR renders ready pages with no backend. The
// layer is built by the `test:e2e` script (nuxt build test/fixtures/e2e) BEFORE
// playwright runs; webServer here just serves the prebuilt .output (fast start,
// reuseExistingServer:false so a stale server is never silently reused).
const PORT = 3000
// localhost (not 127.0.0.1) so the specs' existing `url: 'http://localhost:3000'`
// cookies ride the SSR document request.
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  // The e2e app is a single SSR server on :3000; high parallelism thrashes it and
  // flakes timing-sensitive mutation/hydration tests. Serialize for a
  // deterministic cutover gate, with one retry as a safety net.
  retries: 1,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    actionTimeout: 0,
    trace: 'on-first-retry',
    headless: true,
    locale: 'en-US',
  },
  // Local uses the system Chrome channel (chromium binaries do not download on
  // the maintainer machine); CI uses the bundled chromium.
  projects: process.env.CI
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'node test/fixtures/e2e/.output/server/index.mjs',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60 * 1000,
    env: { NUXT_PUBLIC_MOCK_API: 'false', PORT: String(PORT) },
  },
})
