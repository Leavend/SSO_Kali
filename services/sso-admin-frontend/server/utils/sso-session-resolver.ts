import type { IncomingMessage } from 'node:http'
import { refreshPortalSession, sessionNeedsRefresh } from './session-refresh'
import type { PortalSession } from './session'
import { readSession, replaceSession, sessionCookieForId, unixTime } from './session'
import { resolveBffRequestId } from './proxy-headers'
import { registerClientSession } from './session-registration'

const RP_SESSION_REGISTRATION_INTERVAL_SECONDS = 300

export type ResolvedSsoSession = {
  readonly sessionId: string
  readonly session: PortalSession
  readonly cookies: readonly string[]
}

export async function resolveSsoSession(
  request: IncomingMessage,
): Promise<ResolvedSsoSession | null> {
  const sessionId = sessionIdFromRequest(request)
  const session = await readSession(request)
  if (!sessionId || !session) return null

  const requestId = resolveBffRequestId(request.headers)
  if (!sessionNeedsRefresh(session)) {
    const registered = await withFreshRpSessionRegistration(session, requestId)
    if (registered !== session) await replaceSession(sessionId, registered)

    return { sessionId, session: registered, cookies: [] }
  }

  const refreshed = await refreshPortalSession(session, { requestId })
  const registered = await withFreshRpSessionRegistration(refreshed, requestId, true)
  await replaceSession(sessionId, registered)

  return { sessionId, session: registered, cookies: [sessionCookieForId(sessionId, registered)] }
}

export function sessionHeaders(resolved: ResolvedSsoSession): Record<string, readonly string[]> {
  return resolved.cookies.length > 0 ? { 'set-cookie': resolved.cookies } : {}
}

function sessionIdFromRequest(request: IncomingMessage): string | null {
  const raw = request.headers.cookie ?? ''
  const match = raw.match(/(?:^|;\s*)__Host-sso-admin-session=([^;]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function withFreshRpSessionRegistration(
  session: PortalSession,
  requestId: string,
  force = false,
): Promise<PortalSession> {
  if (!force && rpSessionRegistrationIsFresh(session)) return session
  if (!(await registerClientSession(session.accessToken, requestId))) return session

  return { ...session, rpSessionRegisteredAt: unixTime() }
}

function rpSessionRegistrationIsFresh(session: PortalSession): boolean {
  return (
    typeof session.rpSessionRegisteredAt === 'number' &&
    session.rpSessionRegisteredAt + RP_SESSION_REGISTRATION_INTERVAL_SECONDS > unixTime()
  )
}
