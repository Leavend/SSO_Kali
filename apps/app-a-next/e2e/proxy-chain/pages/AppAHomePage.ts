import { expect, type Page } from "@playwright/test";

export class AppAHomePage {
  public constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  public async open(): Promise<void> {
    await this.page.goto(this.baseUrl);
  }

  public async startLogin(): Promise<void> {
    await this.page.getByRole("button", { name: "Mulai Login PKCE" }).click();
  }

  public async expectConnected(): Promise<void> {
    await expect(this.page.getByText("Session Active")).toBeVisible();
  }

  public async expectConnectedNotice(): Promise<void> {
    await expect(
      this.page.getByText(
        "Handshake selesai. Session App A sudah diregistrasikan ke backend untuk back-channel logout.",
      ),
    ).toBeVisible();
  }

  public async screenshot(): Promise<Buffer> {
    return this.page.screenshot({ fullPage: true });
  }
}
