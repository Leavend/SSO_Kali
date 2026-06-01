import type { IncomingMessage } from 'node:http'
import { refreshPortalSession, sessionNeedsRefresh } from './session-refresh.js'
import type { PortalSession } from './session.js'
import { readSession, replaceSession, sessionCookieForId } from './session.js'
import { resolveBffRequestId } from './proxy-headers.js'

export type ResolvedSsoSession = {
  readonly session: PortalSession
  readonly cookies: readonly string[]
}

export async function resolveSsoSession(
  request: IncomingMessage,
): Promise<ResolvedSsoSession | null> {
  const sessionId = sessionIdFromRequest(request)
  const session = await readSession(request)
  if (!sessionId || !session) return null
  if (!sessionNeedsRefresh(session)) return { session, cookies: [] }

  const refreshed = await refreshPortalSession(session, {
    requestId: resolveBffRequestId(request.headers),
  })
  await replaceSession(sessionId, refreshed)
  return { session: refreshed, cookies: [sessionCookieForId(sessionId, refreshed)] }
}

export function sessionHeaders(resolved: ResolvedSsoSession): Record<string, readonly string[]> {
  return resolved.cookies.length > 0 ? { 'set-cookie': resolved.cookies } : {}
}

function sessionIdFromRequest(request: IncomingMessage): string | null {
  const raw = request.headers.cookie ?? ''
  const match = raw.match(/(?:^|;\s*)__Host-sso-admin-session=([^;]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}
