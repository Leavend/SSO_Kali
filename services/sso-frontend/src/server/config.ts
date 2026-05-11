export type AdminConfig = {
  readonly issuer: string
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly jwksUrl: string
  readonly logoutUrl: string
  readonly internalLogoutUrl: string
  readonly internalRevocationUrl: string
  readonly clientId: string
  readonly redirectUri: string
  readonly adminApiUrl: string
  readonly appBaseUrl: string
  readonly sessionIdleTtlSeconds: number
  readonly sessionAbsoluteTtlSeconds: number
  readonly adminFreshAuthTtlSeconds: number
  readonly port: number
}

export function getConfig(): AdminConfig {
  const base = env('VITE_SSO_BASE_URL') ?? env('NEXT_PUBLIC_SSO_BASE_URL') ?? 'http://localhost:8200'
  const appBase =
    env('VITE_ADMIN_BASE_URL') ?? env('NEXT_PUBLIC_APP_BASE_URL') ?? 'http://localhost:3000'
  const internalBase = env('SSO_INTERNAL_BASE_URL')

  return {
    issuer: base,
    authorizeUrl: `${base}/authorize`,
    tokenUrl: env('SSO_INTERNAL_TOKEN_URL') ?? `${base}/token`,
    jwksUrl: env('SSO_INTERNAL_JWKS_URL') ?? `${base}/jwks`,
    logoutUrl: `${base}/connect/logout`,
    internalLogoutUrl: internalBase ? `${internalBase}/connect/logout` : `${base}/connect/logout`,
    internalRevocationUrl: internalBase ? `${internalBase}/revocation` : `${base}/revocation`,
    clientId: env('VITE_CLIENT_ID') ?? env('NEXT_PUBLIC_CLIENT_ID') ?? 'sso-admin-panel',
    redirectUri: `${appBase}/auth/callback`,
    adminApiUrl: env('SSO_INTERNAL_ADMIN_API_URL') ?? `${base}/admin/api`,
    appBaseUrl: appBase,
    ...sessionConfig(),
    port: Number(env('PORT') ?? 3000),
  }
}

function sessionConfig(): Pick<AdminConfig, 'sessionIdleTtlSeconds' | 'sessionAbsoluteTtlSeconds' | 'adminFreshAuthTtlSeconds'> {
  const sessionAbsoluteTtlSeconds = integerEnv('ADMIN_SESSION_ABSOLUTE_TTL_SECONDS', 60 * 60 * 24 * 30)

  return {
    sessionIdleTtlSeconds: integerEnv('ADMIN_SESSION_IDLE_TTL_SECONDS', 60 * 60 * 24 * 7),
    sessionAbsoluteTtlSeconds,
    adminFreshAuthTtlSeconds: integerEnv('ADMIN_FRESH_AUTH_TTL_SECONDS', sessionAbsoluteTtlSeconds),
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

