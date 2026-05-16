export type PortalConfig = {
  readonly issuer: string
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly jwksUrl: string
  readonly logoutUrl: string
  readonly internalBaseUrl: string
  readonly internalLogoutUrl: string
  readonly internalRevocationUrl: string
  readonly clientId: string
  readonly redirectUri: string
  readonly appBaseUrl: string
  readonly sessionIdleTtlSeconds: number
  readonly sessionAbsoluteTtlSeconds: number
  readonly freshAuthTtlSeconds: number
  readonly port: number
}

export function getConfig(): PortalConfig {
  const base =
    env('VITE_SSO_BASE_URL') ?? env('NEXT_PUBLIC_SSO_BASE_URL') ?? 'http://localhost:8200'
  const appBase =
    env('VITE_SSO_FRONTEND_BASE_URL') ?? env('NEXT_PUBLIC_APP_BASE_URL') ?? 'http://localhost:3000'
  const internalBase = env('SSO_INTERNAL_BASE_URL') ?? base

  return {
    issuer: base,
    authorizeUrl: `${base}/authorize`,
    tokenUrl: env('SSO_INTERNAL_TOKEN_URL') ?? `${internalBase}/token`,
    jwksUrl: env('SSO_INTERNAL_JWKS_URL') ?? `${internalBase}/jwks`,
    logoutUrl: `${base}/connect/logout`,
    internalBaseUrl: internalBase,
    internalLogoutUrl: `${internalBase}/connect/logout`,
    internalRevocationUrl: `${internalBase}/revocation`,
    clientId: env('VITE_CLIENT_ID') ?? env('NEXT_PUBLIC_CLIENT_ID') ?? 'sso-frontend-portal',
    redirectUri: `${appBase}/auth/callback`,
    appBaseUrl: appBase,
    ...sessionConfig(),
    port: Number(env('PORT') ?? 3000),
  }
}

function sessionConfig(): Pick<
  PortalConfig,
  'sessionIdleTtlSeconds' | 'sessionAbsoluteTtlSeconds' | 'freshAuthTtlSeconds'
> {
  const sessionAbsoluteTtlSeconds = integerEnv(
    'SSO_SESSION_ABSOLUTE_TTL_SECONDS',
    60 * 60 * 24 * 30,
  )

  return {
    sessionIdleTtlSeconds: integerEnv('SSO_SESSION_IDLE_TTL_SECONDS', 60 * 60 * 24 * 7),
    sessionAbsoluteTtlSeconds,
    freshAuthTtlSeconds: integerEnv('SSO_FRESH_AUTH_TTL_SECONDS', sessionAbsoluteTtlSeconds),
  }
}

function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

function integerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(env(name) ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
