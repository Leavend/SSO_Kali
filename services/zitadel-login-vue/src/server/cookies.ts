import { createHmac, timingSafeEqual } from 'node:crypto'

import type { RuntimeConfig } from './config.js'

export interface LoginSessionState {
  readonly sessionId: string
  readonly sessionToken: string
  readonly loginName: string
  readonly authRequest?: string
}

export const LOGIN_SESSION_COOKIE = '__Secure-devsso_vue_login_session'

export function serializeLoginState(state: LoginSessionState, config: RuntimeConfig): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, config.cookieSecret)}`
}

export function parseLoginState(value: string | null, config: RuntimeConfig): LoginSessionState | null {
  if (!value) return null
  const [payload, signature] = value.split('.')
  if (!payload || !signature || !isValidSignature(payload, signature, config.cookieSecret)) return null
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LoginSessionState
}

export function sessionCookie(value: string, config: RuntimeConfig): string {
  const secure = config.secureCookies ? '; Secure' : ''
  return `${LOGIN_SESSION_COOKIE}=${value}; Path=${config.publicBasePath}; HttpOnly; SameSite=Lax${secure}`
}

export function clearSessionCookie(config: RuntimeConfig): string {
  const secure = config.secureCookies ? '; Secure' : ''
  return `${LOGIN_SESSION_COOKIE}=; Path=${config.publicBasePath}; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function isValidSignature(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
