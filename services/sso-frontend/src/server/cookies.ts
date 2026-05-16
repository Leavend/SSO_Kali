import type { IncomingMessage } from 'node:http'

export const SSO_PORTAL_SESSION_COOKIE = '__Host-sso-portal-session'
export const SSO_PORTAL_LEGACY_SESSION_COOKIE = '__Host-sso-portal-session-legacy'
export const SSO_PORTAL_TX_COOKIE = '__Host-sso-portal-tx'

export type CookieOptions = {
  readonly httpOnly?: boolean
  readonly secure?: boolean
  readonly sameSite?: 'Strict' | 'Lax' | 'None'
  readonly path?: string
  readonly maxAge?: number
  readonly expires?: Date
}

export function readCookie(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie
  if (!header) return null

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  assertSecureCookieName(name)

  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)

  return parts.join('; ')
}

export function hostCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'Strict',
    secure: true,
  }
}

export function expiredHostCookieOptions(): CookieOptions {
  return {
    ...hostCookieOptions(0),
    expires: new Date(0),
  }
}

/**
 * __Host- prefix (RFC 6265bis §4.1.3.2) enforces:
 * - Secure attribute must be set
 * - Path must be "/"
 * - Domain attribute must NOT be set
 * This prevents subdomain cookie leakage and tightens cookie scope.
 */
function assertSecureCookieName(name: string): void {
  if (!name.startsWith('__Host-')) {
    throw new Error('Frontend session cookies must use the __Host- prefix.')
  }
}
