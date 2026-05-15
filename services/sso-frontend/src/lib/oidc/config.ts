/**
 * OIDC runtime config — dibaca dari Vite env.
 */

type RequiredEnv = 'VITE_OIDC_ISSUER' | 'VITE_OIDC_CLIENT_ID'

export type OidcConfig = {
  readonly issuer: string
  readonly client_id: string
  readonly authorize_endpoint: string
  readonly token_endpoint: string
  readonly end_session_endpoint: string
  readonly redirect_uri: string
  readonly post_logout_redirect_uri: string
  readonly scope: string
}

export function readOidcConfig(): OidcConfig {
  const issuer = read('VITE_OIDC_ISSUER')
  const client_id = read('VITE_OIDC_CLIENT_ID')
  const scope = readOrDefault('VITE_OIDC_SCOPE', 'openid profile email')
  const baseIssuer = issuer.replace(/\/$/, '')
  const redirect = readOrDefault('VITE_OIDC_REDIRECT_URI', `${originOrEmpty()}/auth/callback`)

  return {
    issuer,
    client_id,
    scope,
    redirect_uri: redirect,
    authorize_endpoint: readOrDefault(
      'VITE_OIDC_AUTHORIZE_ENDPOINT',
      `${baseIssuer}/oauth/authorize`,
    ),
    token_endpoint: readOrDefault('VITE_OIDC_TOKEN_ENDPOINT', `${baseIssuer}/oauth/token`),
    end_session_endpoint: readOrDefault(
      'VITE_OIDC_END_SESSION_ENDPOINT',
      `${baseIssuer}/connect/logout`,
    ),
    post_logout_redirect_uri: readOrDefault(
      'VITE_OIDC_POST_LOGOUT_REDIRECT_URI',
      `${originOrEmpty()}/`,
    ),
  }
}

function read(key: RequiredEnv): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required env: ${key}`)
  }
  return value
}

function readOrDefault(key: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function originOrEmpty(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}
