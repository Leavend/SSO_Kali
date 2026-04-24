import type { Page } from "@playwright/test";

type AdminE2EScenario = "fresh-admin" | "step-up-stale-admin" | "non-admin";

export async function seedAdminSession(
  page: Page,
  scenario: AdminE2EScenario,
) {
  const response = await page.goto(`/api/e2e/admin-session?scenario=${encodeURIComponent(scenario)}`);

  if (!response?.ok()) {
    throw new Error(`Failed to seed admin session: ${response?.status() ?? "no-response"}`);
  }
}
