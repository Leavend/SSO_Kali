import { expect, type Locator, type Page } from "@playwright/test";

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

export class IdentityLoginPage {
  public constructor(
    private readonly page: Page,
    private readonly issuerBaseUrl: string,
  ) {}

  public async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(loginUiPattern(this.issuerBaseUrl));
  }

  public async signIn(username: string, password: string): Promise<void> {
    await this.expectLoaded();
    await fillIfVisible(this.page, loginSelectors, username);
    await submitIfNeeded(this.page);
    await fillIfVisible(this.page, passwordSelectors, password);
    await submitIfNeeded(this.page);
    await this.page.waitForLoadState("networkidle");
  }
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

function loginUiPattern(baseUrl: string): RegExp {
  return new RegExp(`^${escapeRegExp(baseUrl)}/ui/v2/login/`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
