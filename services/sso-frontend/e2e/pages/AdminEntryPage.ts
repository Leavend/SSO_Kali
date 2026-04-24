import { expect, type Page } from "@playwright/test";

export class AdminEntryPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/");
  }

  async expectVisible() {
    await expect(this.page.getByRole("heading", { name: "Secure Admin Sign-In" })).toBeVisible();
    await expect(this.page.getByRole("link", { name: "Continue to Secure Sign-In" })).toBeVisible();
  }

  async continueToHostedLogin() {
    await this.page.getByRole("link", { name: "Continue to Secure Sign-In" }).click();
  }
}
