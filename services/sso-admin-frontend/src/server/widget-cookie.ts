import { serializeCookie, type CookieOptions } from './cookies.js'

// First-party widget session cookie. Value is the raw IdP `session_id` (== id_token `sid`),
// so the same-origin /widget/* proxy can resolve the session backend-side. Host-only.
export const SSO_WIDGET_SESSION_COOKIE = '__Host-sso_session'

/**
 * Widget session cookie options: same-origin /widget/* fetch only needs SameSite=Lax,
 * which is safer than None and still survives the BFF same-origin proxy hop.
 */
export function widgetHostCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'Lax',
    secure: true,
  }
}

export function expiredWidgetHostCookieOptions(): CookieOptions {
  return {
    ...widgetHostCookieOptions(0),
    expires: new Date(0),
  }
}

/**
 * Mint the first-party widget session cookie from the validated id_token `sid`.
 * The value is the raw IdP `session_id`; the same-origin /widget/* proxy forwards it
 * so the backend resolves the session host-locally. Only call with a non-empty `sid`
 * taken from an id_token that has already passed signature/issuer/audience/nonce checks.
 */
// WGAP3 caveat: the cookie's max-age tracks the BFF session (re-minted on every
// /auth/refresh via refreshResponse), NOT the backend SsoSession idle/absolute clock.
// A /widget/* 401 WITH this cookie present therefore means the backend session
// expired or was revoked — graceful (backend rejects a stale sid), not a client bug.
export function widgetSessionCookie(input: {
  readonly sid?: string
  readonly maxAgeSeconds: number
}): string | null {
  if (typeof input.sid !== 'string' || input.sid === '') return null

  return serializeCookie(
    SSO_WIDGET_SESSION_COOKIE,
    input.sid,
    widgetHostCookieOptions(input.maxAgeSeconds),
  )
}

export function clearWidgetSessionCookie(): string {
  return serializeCookie(SSO_WIDGET_SESSION_COOKIE, '', expiredWidgetHostCookieOptions())
}
