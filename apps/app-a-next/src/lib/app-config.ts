import { appSessionCookieName } from "@/lib/cookie-policy";

export type AppConfig = {
  readonly appName: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
};

export type ServerAppConfig = {
  readonly baseUrl: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly resourceAudience: string;
  readonly jwtAllowedAlgorithms: readonly string[];
  readonly jwtClockSkewSeconds: number;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
  readonly tokenUrl: string;
  readonly profileUrl: string;
  readonly registerSessionUrl: string;
  readonly logoutUrl: string;
  readonly jwksUrl: string;
  readonly redisUrl: string;
  readonly sessionCookieName: string;
  readonly sessionIdleTtlSeconds: number;
  readonly sessionAbsoluteTtlSeconds: number;
  readonly refreshLockTtlSeconds: number;
};

export function getPublicConfig(): AppConfig {
  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Dummy App A",
    issuer: process.env.NEXT_PUBLIC_SSO_ISSUER ?? "http://localhost:8200",
    clientId: process.env.NEXT_PUBLIC_CLIENT_ID ?? "prototype-app-a",
    authorizeUrl: process.env.NEXT_PUBLIC_AUTHORIZE_URL ?? "http://localhost:8200/authorize",
    callbackUrl: process.env.NEXT_PUBLIC_CALLBACK_URL ?? "http://localhost:3001/auth/callback",
  };
}

export function getServerConfig(): ServerAppConfig {
  const publicConfig = getPublicConfig();

  return {
    baseUrl: process.env.APP_BASE_URL ?? "http://localhost:3001",
    issuer: publicConfig.issuer,
    clientId: publicConfig.clientId,
    resourceAudience: process.env.SSO_RESOURCE_AUDIENCE ?? "sso-resource-api",
    jwtAllowedAlgorithms: csvList(process.env.SSO_JWT_ALLOWED_ALGS, "ES256"),
    jwtClockSkewSeconds: integerEnv(process.env.SSO_JWT_CLOCK_SKEW_SECONDS, 60),
    authorizeUrl: publicConfig.authorizeUrl,
    callbackUrl: publicConfig.callbackUrl,
    tokenUrl: process.env.SSO_TOKEN_URL ?? `${publicConfig.issuer}/token`,
    profileUrl: process.env.SSO_PROFILE_URL ?? `${publicConfig.issuer}/api/profile`,
    registerSessionUrl: process.env.SSO_REGISTER_SESSION_URL ?? `${publicConfig.issuer}/connect/register-session`,
    logoutUrl: process.env.SSO_LOGOUT_URL ?? `${publicConfig.issuer}/connect/logout`,
    jwksUrl: process.env.SSO_JWKS_URL ?? `${publicConfig.issuer}/jwks`,
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379/1",
    ...sessionConfig(),
  };
}

function sessionConfig() {
  return {
    sessionCookieName: appSessionCookieName(
      process.env.APP_SESSION_COOKIE_NAME ?? "__Host-app-a-session",
    ),
    sessionIdleTtlSeconds: integerEnv(process.env.APP_SESSION_IDLE_TTL_SECONDS, 60 * 60 * 24 * 7),
    sessionAbsoluteTtlSeconds: integerEnv(
      process.env.APP_SESSION_ABSOLUTE_TTL_SECONDS,
      60 * 60 * 24 * 30,
    ),
    refreshLockTtlSeconds: integerEnv(process.env.APP_REFRESH_LOCK_TTL_SECONDS, 15),
  };
}

function csvList(value: string | undefined, fallback: string): readonly string[] {
  return (value ?? fallback)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function integerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed) ? parsed : fallback;
}
