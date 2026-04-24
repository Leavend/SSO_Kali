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
    port: Number(env('PORT') ?? 3000),
  }
}

function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}
