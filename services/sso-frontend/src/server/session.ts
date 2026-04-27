import type { IncomingMessage } from 'node:http'
import type { AdminPermissions, AdminPrincipal, AdminSessionView } from '../shared/admin.js'
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_TX_COOKIE,
  expiredHostCookieOptions,
  hostCookieOptions,
  readCookie,
  serializeCookie,
} from './cookies.js'
import { decryptSession, encryptSession } from './session-crypto.js'

export type AdminSession = AdminSessionView & {
  readonly accessToken: string
  readonly idToken: string
  readonly refreshToken: string
  readonly sub: string
  readonly displayName: string
}

export type AuthTransaction = {
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
  readonly returnTo?: string
}

export function getSession(request: IncomingMessage): AdminSession | null {
  const session = readSession(request)
  if (!session || isSessionExpired(session.expiresAt)) return null

  return session
}

export function readSession(request: IncomingMessage): AdminSession | null {
  const raw = readCookie(request, ADMIN_SESSION_COOKIE)
  if (!raw) return null

  try {
    const decrypted = decryptSession(raw)
    if (!decrypted) return null

    return JSON.parse(decrypted) as AdminSession
  } catch {
    return null
  }
}

export function sessionCookie(session: AdminSession): string {
  return serializeCookie(
    ADMIN_SESSION_COOKIE,
    encryptSession(JSON.stringify(session)),
    hostCookieOptions(3600),
  )
}

export function clearSessionCookie(): string {
  return serializeCookie(ADMIN_SESSION_COOKIE, '', expiredHostCookieOptions())
}

export function transactionCookie(tx: AuthTransaction): string {
  return serializeCookie(ADMIN_TX_COOKIE, encryptSession(JSON.stringify(tx)), hostCookieOptions(300))
}

export function clearTransactionCookie(): string {
  return serializeCookie(ADMIN_TX_COOKIE, '', expiredHostCookieOptions())
}

export function pullTransaction(request: IncomingMessage): AuthTransaction | null {
  const raw = readCookie(request, ADMIN_TX_COOKIE)
  if (!raw) return null

  try {
    const decrypted = decryptSession(raw)
    if (!decrypted) return null

    return JSON.parse(decrypted) as AuthTransaction
  } catch {
    return null
  }
}

export function sessionFromBootstrap(
  tokens: {
    readonly accessToken: string
    readonly idToken: string
    readonly refreshToken: string
    readonly expiresAt: number
  },
  principal: AdminPrincipal,
): AdminSession {
  return {
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    sub: principal.subject_id,
    subject: principal.subject_id,
    email: principal.email,
    displayName: principal.display_name,
    role: principal.role,
    expiresAt: tokens.expiresAt,
    authTime: principal.auth_context.auth_time,
    amr: [...principal.auth_context.amr],
    acr: principal.auth_context.acr,
    lastLoginAt: principal.last_login_at,
    permissions: principal.permissions,
  }
}

export function publicSession(session: AdminSession): AdminSessionView {
  return {
    subject: session.sub,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    expiresAt: session.expiresAt,
    authTime: session.authTime,
    amr: session.amr,
    acr: session.acr,
    lastLoginAt: session.lastLoginAt,
    permissions: normalizedPermissions(session.permissions),
  }
}

function normalizedPermissions(permissions: AdminPermissions): AdminPermissions {
  return {
    view_admin_panel: Boolean(permissions.view_admin_panel),
    manage_sessions: Boolean(permissions.manage_sessions),
  }
}

export function isSessionExpired(expiresAt: number, bufferSeconds = 30): boolean {
  return expiresAt < Math.floor(Date.now() / 1000) + bufferSeconds
}
