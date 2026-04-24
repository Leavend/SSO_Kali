import { expect, type APIRequestContext } from "@playwright/test";

export type OpenIdConfiguration = {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
};

export async function fetchOpenIdConfiguration(
  request: APIRequestContext,
  baseUrl: string,
): Promise<OpenIdConfiguration> {
  const response = await request.get(`${baseUrl}/.well-known/openid-configuration`);

  expect(response.ok()).toBeTruthy();

  return (await response.json()) as OpenIdConfiguration;
}
