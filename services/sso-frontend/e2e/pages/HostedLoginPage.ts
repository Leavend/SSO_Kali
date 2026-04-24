import { expect, type Page } from "@playwright/test";

export class HostedLoginPage {
  constructor(private readonly page: Page) {}

  async waitForLoaded() {
    await expect(this.page).toHaveURL(/\/api\/e2e\/mock-sso\/authorize/);
  }

  async expectForcedCredentialStep() {
    await expect(this.page.getByRole("heading", { name: "Credential Step Required" })).toBeVisible();
    await expect(this.page.getByText("Active upstream session")).toBeVisible();
    await expect(this.page.getByTestId("prompt-value")).toHaveText("login");
    await expect(this.page.getByTestId("max-age-value")).toHaveText("0");
  }

  async expectPromptLoginInUrl() {
    await expect(this.page).toHaveURL(/prompt=login/);
    await expect(this.page).toHaveURL(/max_age=0/);
  }
}
