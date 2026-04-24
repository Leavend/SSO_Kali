export type SloE2eConfig = {
  readonly appABaseUrl: string;
  readonly appBBaseUrl: string;
  readonly password: string;
  readonly username: string;
};

export function readSloE2eConfig(): SloE2eConfig | null {
  const appABaseUrl = requiredEnv("PLAYWRIGHT_APP_A_BASE_URL");
  const appBBaseUrl = requiredEnv("PLAYWRIGHT_APP_B_BASE_URL");
  const username = requiredEnv("PLAYWRIGHT_SSO_USERNAME");
  const password = requiredEnv("PLAYWRIGHT_SSO_PASSWORD");

  if (!appABaseUrl || !appBBaseUrl || !username || !password) {
    return null;
  }

  return {
    appABaseUrl,
    appBBaseUrl,
    password,
    username,
  };
}

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";

  return value.length > 0 ? value : null;
}
