import type { IncomingMessage } from 'node:http'
import type { H3Event } from 'h3'

export const SSO_PORTAL_SESSION_COOKIE = '__Host-sso-admin-session'
export const SSO_PORTAL_TX_COOKIE = '__Host-sso-admin-tx'

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
 * Nitro adapter: read a cookie off the H3 event's underlying IncomingMessage,
 * reusing the legacy parser so decode behavior is identical to the Node BFF.
 */
export function readEventCookie(event: H3Event, name: string): string | null {
  return readCookie(event.node.req as IncomingMessage, name)
}

/**
 * Nitro adapter: append one pre-serialized Set-Cookie line to the H3 event's
 * response, preserving every prior cookie (mirrors h3 appendResponseHeader for
 * the multi-valued set-cookie header so session + widget cookies all survive).
 */
export function appendEventCookie(event: H3Event, serialized: string): void {
  const res = event.node.res
  const existing = res.getHeader('set-cookie')
  const list = Array.isArray(existing)
    ? existing.map(String)
    : existing != null
      ? [String(existing)]
      : []
  res.setHeader('set-cookie', [...list, serialized])
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
