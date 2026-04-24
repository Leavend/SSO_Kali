export type ProxyChainE2eConfig = {
  readonly appABaseUrl: string;
  readonly brokerBaseUrl: string;
  readonly idpBaseUrl: string;
  readonly username: string;
  readonly password: string;
};

export function readProxyChainE2eConfig(): ProxyChainE2eConfig | null {
  const appABaseUrl = requiredEnv("PLAYWRIGHT_PROXY_APP_A_BASE_URL");
  const brokerBaseUrl = requiredEnv("PLAYWRIGHT_PROXY_BROKER_BASE_URL");
  const idpBaseUrl = requiredEnv("PLAYWRIGHT_PROXY_IDP_BASE_URL");
  const username = requiredEnv("PLAYWRIGHT_SSO_USERNAME");
  const password = requiredEnv("PLAYWRIGHT_SSO_PASSWORD");

  if (!appABaseUrl || !brokerBaseUrl || !idpBaseUrl || !username || !password) {
    return null;
  }

  return {
    appABaseUrl,
    brokerBaseUrl,
    idpBaseUrl,
    username,
    password,
  };
}

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";

  return value.length > 0 ? value : null;
}
