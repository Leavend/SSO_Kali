import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/playwright-output",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "./test-results/playwright-report" }],
    ["json", { outputFile: "./test-results/playwright-results.json" }],
  ],
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_APP_A_BASE_URL ?? "http://localhost:3001",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
