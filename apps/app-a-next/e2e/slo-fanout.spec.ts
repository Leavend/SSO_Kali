import { test } from "@playwright/test";
import {
  assertAppBLoggedOut,
  loginToAppA,
  loginToAppB,
  logoutFromAppA,
} from "./support/oidc-login";
import { readSloE2eConfig } from "./support/slo-env";

test("logout from App A revokes App B via broker fan-out", async ({ browser }) => {
  const loadedConfig = readSloE2eConfig();

  test.skip(loadedConfig === null, "SLO E2E env is not configured.");

  if (loadedConfig === null) {
    return;
  }

  const config = loadedConfig;

  const context = await browser.newContext();
  const appAPage = await context.newPage();
  const appBPage = await context.newPage();

  await loginToAppA(appAPage, config);
  await loginToAppB(appBPage, config);
  await logoutFromAppA(appAPage);
  await assertAppBLoggedOut(appBPage, config);
});
