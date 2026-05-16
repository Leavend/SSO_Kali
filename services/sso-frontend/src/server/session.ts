import type { IncomingMessage } from 'node:http'
import type { PortalSessionView, SsoPrincipal } from '../shared/user.js'
import { getConfig } from './config.js'
import {
  SSO_PORTAL_SESSION_COOKIE,
  SSO_PORTAL_TX_COOKIE,
  expiredHostCookieOptions,
  hostCookieOptions,
  readCookie,
  serializeCookie,
} from './cookies.js'
import { decryptSession, encryptSession } from './session-crypto.js'

export type PortalSession = PortalSessionView & {
  readonly accessToken: string
  readonly idToken: string
  readonly refreshToken: string
  readonly sub: string
  readonly displayName: string
  readonly issuedAt: number
  readonly absoluteExpiresAt: number
  readonly lastRefreshedAt: number
}

export type AuthTransaction = {
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
  readonly returnTo?: string
}

export function getSession(request: IncomingMessage): PortalSession | null {
  const session = readSession(request)
  if (!session || isSessionExpired(session.expiresAt)) return null

  return session
}

export function readSession(request: IncomingMessage): PortalSession | null {
  const raw = readCookie(request, SSO_PORTAL_SESSION_COOKIE)
  if (!raw) return null

  try {
    const decrypted = decryptSession(raw)
    if (!decrypted) return null

    return normalizeSession(JSON.parse(decrypted) as Partial<PortalSession>)
  } catch {
    return null
  }
}

export function sessionCookie(session: PortalSession): string {
  return serializeCookie(
    SSO_PORTAL_SESSION_COOKIE,
    encryptSession(JSON.stringify(session)),
    hostCookieOptions(sessionCookieMaxAge(session)),
  )
}

export function clearSessionCookie(): string {
  return serializeCookie(SSO_PORTAL_SESSION_COOKIE, '', expiredHostCookieOptions())
}

export function transactionCookie(tx: AuthTransaction): string {
  return serializeCookie(
    SSO_PORTAL_TX_COOKIE,
    encryptSession(JSON.stringify(tx)),
    hostCookieOptions(300),
  )
}

export function clearTransactionCookie(): string {
  return serializeCookie(SSO_PORTAL_TX_COOKIE, '', expiredHostCookieOptions())
}

export function pullTransaction(request: IncomingMessage): AuthTransaction | null {
  const raw = readCookie(request, SSO_PORTAL_TX_COOKIE)
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
  principal: SsoPrincipal,
): PortalSession {
  const issuedAt = unixTime()

  return {
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    sub: principal.subjectId,
    subject: principal.subjectId,
    email: principal.email,
    displayName: principal.displayName,
    role: principal.role,
    expiresAt: tokens.expiresAt,
    authTime: principal.authContext.auth_time,
    amr: [...principal.authContext.amr],
    acr: principal.authContext.acr,
    lastLoginAt: principal.lastLoginAt,
    issuedAt,
    absoluteExpiresAt: issuedAt + getConfig().sessionAbsoluteTtlSeconds,
    lastRefreshedAt: issuedAt,
  }
}

export function publicSession(session: PortalSession): PortalSessionView {
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
  }
}

export function isSessionExpired(expiresAt: number, bufferSeconds = 30): boolean {
  return expiresAt < unixTime() + bufferSeconds
}

export function isSessionAbsoluteExpired(session: PortalSession): boolean {
  return session.absoluteExpiresAt <= unixTime()
}

export function unixTime(): number {
  return Math.floor(Date.now() / 1000)
}

function normalizeSession(session: Partial<PortalSession>): PortalSession | null {
  if (!isValidSessionShape(session)) return null

  const issuedAt = numericOr(session.issuedAt, session.authTime ?? unixTime())
  const absoluteExpiresAt = numericOr(
    session.absoluteExpiresAt,
    issuedAt + getConfig().sessionAbsoluteTtlSeconds,
  )

  if (absoluteExpiresAt <= unixTime()) return null

  return {
    ...session,
    issuedAt,
    absoluteExpiresAt,
    lastRefreshedAt: numericOr(session.lastRefreshedAt, unixTime()),
  }
}

function isValidSessionShape(session: Partial<PortalSession>): session is PortalSession {
  return Boolean(
    session.accessToken &&
    session.idToken &&
    session.refreshToken &&
    session.sub &&
    session.email &&
    session.displayName &&
    session.role &&
    typeof session.expiresAt === 'number',
  )
}

function sessionCookieMaxAge(session: PortalSession): number {
  const absoluteRemaining = Math.max(0, session.absoluteExpiresAt - unixTime())
  return Math.min(getConfig().sessionIdleTtlSeconds, absoluteRemaining)
}

function numericOr(value: number | undefined | null, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
