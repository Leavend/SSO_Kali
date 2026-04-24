import { expect, type Page } from "@playwright/test";

export class AdminSessionsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/sessions");
  }

  async expectLoaded() {
    await expect(this.page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(this.page.getByText("Sensitive actions need a newer sign-in")).toBeVisible();
  }

  async clickFirstRevoke() {
    await this.page.getByRole("button", { name: "Revoke" }).first().click();
  }

  async expectReauthInterstitial() {
    const dialog = this.page.getByRole("dialog");

    await expect(dialog.getByRole("heading", { name: "Re-authentication Required" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Verify Identity Again" })).toHaveAttribute("href", "/auth/login?return_to=%2Fsessions");
    await expect(dialog.getByRole("button", { name: "Confirm" })).toHaveCount(0);
  }
}
