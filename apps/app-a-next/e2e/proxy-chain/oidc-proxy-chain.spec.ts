import { expect, test } from "@playwright/test";
import { AppAHomePage } from "./pages/AppAHomePage";
import { IdentityLoginPage } from "./pages/IdentityLoginPage";
import { attachJsonEvidence } from "./support/evidence";
import {
  fetchOpenIdConfiguration,
  type OpenIdConfiguration,
} from "./support/openid-discovery";
import { readProxyChainE2eConfig } from "./support/proxy-chain-env";
import { attachRedirectTrace, hasTraceUrl } from "./support/redirect-trace";

test("authorize to callback survives chained proxies", async ({
  page,
  request,
}, testInfo) => {
  const loadedConfig = readProxyChainE2eConfig();

  test.skip(loadedConfig === null, "Proxy-chain E2E env is not configured.");

  if (loadedConfig === null) {
    return;
  }

  const config = loadedConfig;
  const brokerDocument = await fetchOpenIdConfiguration(
    request,
    config.brokerBaseUrl,
  );
  const idpDocument = await fetchOpenIdConfiguration(request, config.idpBaseUrl);

  await assertBrokerContract(config.brokerBaseUrl, brokerDocument);
  await assertIdpContract(config.idpBaseUrl, idpDocument);
  await attachJsonEvidence(testInfo, "broker-openid-configuration.json", brokerDocument);
  await attachJsonEvidence(testInfo, "idp-openid-configuration.json", idpDocument);

  const stopTrace = attachRedirectTrace(page);
  const appAHomePage = new AppAHomePage(page, config.appABaseUrl);
  const identityLoginPage = new IdentityLoginPage(page, config.idpBaseUrl);

  await appAHomePage.open();
  await appAHomePage.startLogin();
  await identityLoginPage.signIn(config.username, config.password);
  await appAHomePage.expectConnected();
  await appAHomePage.expectConnectedNotice();

  const trace = stopTrace();

  await assertProxyChainTrace(config, trace);
  await attachJsonEvidence(testInfo, "proxy-chain-trace.json", { trace });
  await testInfo.attach("app-a-session-active.png", {
    body: await appAHomePage.screenshot(),
    contentType: "image/png",
  });
});

async function assertBrokerContract(
  baseUrl: string,
  document: OpenIdConfiguration,
): Promise<void> {
  expect(document.issuer).toBe(baseUrl);
  expect(document.authorization_endpoint).toBe(`${baseUrl}/authorize`);
  expect(document.token_endpoint).toBe(`${baseUrl}/token`);
  expect(document.jwks_uri).toBe(`${baseUrl}/jwks`);
}

async function assertIdpContract(
  baseUrl: string,
  document: OpenIdConfiguration,
): Promise<void> {
  expect(document.issuer).toBe(baseUrl);
  expect(document.authorization_endpoint).toBe(`${baseUrl}/oauth/v2/authorize`);
  expect(document.token_endpoint).toBe(`${baseUrl}/oauth/v2/token`);
  expect(document.jwks_uri).toBe(`${baseUrl}/oauth/v2/keys`);
}

async function assertProxyChainTrace(
  config: ReturnType<typeof readProxyChainE2eConfig> extends infer T
    ? NonNullable<T>
    : never,
  trace: Parameters<typeof hasTraceUrl>[0],
): Promise<void> {
  expect(hasTraceUrl(trace, `${config.brokerBaseUrl}/authorize?`)).toBeTruthy();
  expect(hasTraceUrl(trace, `${config.idpBaseUrl}/oauth/v2/authorize?`)).toBeTruthy();
  expect(hasTraceUrl(trace, `${config.idpBaseUrl}/ui/v2/login/`)).toBeTruthy();
  expect(hasTraceUrl(trace, `${config.brokerBaseUrl}/callbacks/zitadel?`)).toBeTruthy();
  expect(hasTraceUrl(trace, `${config.appABaseUrl}/auth/callback?`)).toBeTruthy();
}
