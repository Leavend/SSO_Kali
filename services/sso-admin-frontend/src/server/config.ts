export type PortalConfig = {
  readonly issuer: string
  readonly authorizeUrl: string
  readonly publicAuthorizeUrl: string
  readonly tokenUrl: string
  readonly jwksUrl: string
  readonly logoutUrl: string
  readonly internalBaseUrl: string
  readonly internalLogoutUrl: string
  readonly internalRevocationUrl: string
  readonly clientId: string
  readonly clientSecret: string | null
  readonly redirectUri: string
  readonly appBaseUrl: string
  readonly publicBasePath: string
  readonly sessionIdleTtlSeconds: number
  readonly sessionAbsoluteTtlSeconds: number
  readonly freshAuthTtlSeconds: number
  readonly sessionRedisUrl: string | null
  readonly port: number
}

export function getConfig(): PortalConfig {
  const base = env('ADMIN_OIDC_ISSUER') ?? env('VITE_SSO_BASE_URL') ?? 'http://localhost:8200'
  const publicBase = env('ADMIN_OIDC_PUBLIC_ISSUER') ?? base
  const appBase = env('VITE_ADMIN_BASE_URL') ?? env('ADMIN_APP_BASE_URL') ?? 'http://localhost:8080'
  const internalBase = env('SSO_INTERNAL_BASE_URL') ?? base

  return {
    issuer: base,
    authorizeUrl: `${base}/authorize`,
    publicAuthorizeUrl: `${publicBase}/authorize`,
    tokenUrl: env('SSO_INTERNAL_TOKEN_URL') ?? `${internalBase}/token`,
    jwksUrl: env('SSO_INTERNAL_JWKS_URL') ?? `${internalBase}/jwks`,
    logoutUrl: `${base}/connect/logout`,
    internalBaseUrl: internalBase,
    internalLogoutUrl: `${internalBase}/connect/logout`,
    internalRevocationUrl: `${internalBase}/revocation`,
    clientId: env('ADMIN_OIDC_CLIENT_ID') ?? env('VITE_CLIENT_ID') ?? 'sso-admin-panel',
    clientSecret: env('ADMIN_OIDC_CLIENT_SECRET') ?? null,
    redirectUri: `${appBase}/auth/callback`,
    appBaseUrl: appBase,
    publicBasePath: normalizeBasePath(env('VITE_PUBLIC_BASE_PATH')),
    ...sessionConfig(),
    sessionRedisUrl: env('SSO_ADMIN_SESSION_REDIS_URL') ?? env('REDIS_URL') ?? null,
    port: Number(env('PORT') ?? 8080),
  }
}

function normalizeBasePath(path: string | undefined): string {
  if (!path || path === '/') return '/'

  const prefixed = path.startsWith('/') ? path : `/${path}`
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
}

export function warnIfClientSecretMissing(config: PortalConfig = getConfig()): void {
  if (config.clientSecret) return

  console.error(
    'SECURITY MISCONFIGURATION: ADMIN_OIDC_CLIENT_SECRET is empty; confidential OIDC token operations will fail.',
  )
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
