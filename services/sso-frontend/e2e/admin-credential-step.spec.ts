import { test } from "@playwright/test";
import { AdminEntryPage } from "./pages/AdminEntryPage";
import { AdminSessionsPage } from "./pages/AdminSessionsPage";
import { HostedLoginPage } from "./pages/HostedLoginPage";
import { seedAdminSession } from "./support/admin-session";

test("entry screen presents the secure hosted-login flow", async ({ page }) => {
  const entryPage = new AdminEntryPage(page);

  await entryPage.goto();
  await entryPage.expectVisible();
});

test("admin sign-in forces credential entry even when an upstream session already exists", async ({ context, page }) => {
  await context.addCookies([{
    name: "mock-idp-session",
    value: "active",
    url: "http://127.0.0.1:3000",
  }]);

  const entryPage = new AdminEntryPage(page);
  const hostedLoginPage = new HostedLoginPage(page);

  await entryPage.goto();
  await entryPage.continueToHostedLogin();

  await hostedLoginPage.waitForLoaded();
  await hostedLoginPage.expectPromptLoginInUrl();
  await hostedLoginPage.expectForcedCredentialStep();
});

test("stale step-up sessions show a reauth interstitial before revoke can proceed", async ({ page }) => {
  await seedAdminSession(page, "step-up-stale-admin");

  const sessionsPage = new AdminSessionsPage(page);

  await sessionsPage.goto();
  await sessionsPage.expectLoaded();
  await sessionsPage.clickFirstRevoke();
  await sessionsPage.expectReauthInterstitial();
});
