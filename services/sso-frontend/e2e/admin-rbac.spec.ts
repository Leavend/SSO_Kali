import { expect, test } from "@playwright/test";

test("access denied route shows secure recovery actions", async ({ page }) => {
  await page.goto("/access-denied");

  await expect(page.getByRole("heading", { name: "Access Denied" })).toBeVisible();
  await expect(page.getByText("not permitted to use the SSO Admin Panel")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Out Safely" })).toBeVisible();
  await expect(page.getByText("Revoke")).toHaveCount(0);
});
