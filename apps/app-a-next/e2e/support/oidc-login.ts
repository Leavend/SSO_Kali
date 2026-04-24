import { expect, type Locator, type Page } from "@playwright/test";
import type { SloE2eConfig } from "./slo-env";

const loginSelectors = [
  'input[name="loginName"]',
  'input[name="username"]',
  'input[type="email"]',
  'input[type="text"]',
] as const;

const passwordSelectors = [
  'input[name="password"]',
  'input[type="password"]',
] as const;

const submitSelectors = [
  'button[type="submit"]',
  'button:has-text("Continue")',
  'button:has-text("Next")',
  'button:has-text("Sign in")',
  'button:has-text("Login")',
] as const;

export async function loginToAppA(page: Page, config: SloE2eConfig): Promise<void> {
  await page.goto(`${config.appABaseUrl}/auth/login`);
  await completeOidcLogin(page, config);
  await expect(page.getByText("Session Active")).toBeVisible();
}

export async function loginToAppB(page: Page, config: SloE2eConfig): Promise<void> {
  await page.goto(`${config.appBBaseUrl}/auth/login`);
  await completeOidcLogin(page, config);
  await expect(page.getByText("Handshake App B selesai dan sesi lokal sudah aktif.")).toBeVisible();
}

export async function logoutFromAppA(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout Terpusat" }).click();
  await expect(page.getByText("Logout terpusat selesai.")).toBeVisible();
}

export async function assertAppBLoggedOut(page: Page, config: SloE2eConfig): Promise<void> {
  await expect.poll(async () => {
    await page.goto(`${config.appBBaseUrl}/dashboard`);
    return new URL(page.url()).pathname;
  }, { timeout: 15_000 }).toBe("/");

  await expect(page.getByText("Sesi App B belum tersedia atau sudah diputus.")).toBeVisible();
}

async function completeOidcLogin(page: Page, config: SloE2eConfig): Promise<void> {
  await page.waitForLoadState("networkidle");
  await fillIfVisible(page, loginSelectors, config.username);
  await submitIfNeeded(page);
  await fillIfVisible(page, passwordSelectors, config.password);
  await submitIfNeeded(page);
  await page.waitForLoadState("networkidle");
}

async function fillIfVisible(
  page: Page,
  selectors: readonly string[],
  value: string,
): Promise<void> {
  const field = await firstVisible(page, selectors);

  if (field === null) {
    return;
  }

  await field.fill(value);
}

async function submitIfNeeded(page: Page): Promise<void> {
  const button = await firstVisible(page, submitSelectors);

  if (button !== null) {
    await button.click();
    return;
  }

  await page.keyboard.press("Enter");
}

async function firstVisible(
  page: Page,
  selectors: readonly string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();

    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }

  return null;
}
