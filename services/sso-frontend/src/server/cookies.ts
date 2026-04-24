import type { IncomingMessage } from 'node:http'

export const ADMIN_SESSION_COOKIE = '__Secure-admin-session'
export const ADMIN_TX_COOKIE = '__Secure-admin-tx'

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

function assertSecureCookieName(name: string): void {
  if (!name.startsWith('__Secure-')) {
    throw new Error('Frontend session cookies must use the __Secure- prefix.')
  }
}
