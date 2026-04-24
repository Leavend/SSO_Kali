import { defineConfig } from "@playwright/test";

const webServer = process.env.PLAYWRIGHT_BASE_URL
  ? []
  : [{
      command: [
        "env",
        "ENABLE_E2E_COOKIE_PROBE=1",
        "ENABLE_E2E_ADMIN_FLOW_PROBE=1",
        "NEXT_PUBLIC_APP_BASE_URL=http://127.0.0.1:3000",
        "NEXT_PUBLIC_SSO_BASE_URL=http://127.0.0.1:3000/api/e2e/mock-broker",
        "SSO_INTERNAL_ADMIN_API_URL=http://127.0.0.1:3000/api/e2e/admin-api",
        "npm",
        "run",
        "dev",
        "--",
        "--hostname",
        "127.0.0.1",
      ].join(" "),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:3000",
    }];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    headless: true,
  },
  webServer,
});
