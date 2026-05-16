import type { IncomingMessage } from 'node:http'
import { refreshPortalSession, sessionNeedsRefresh } from './session-refresh.js'
import type { PortalSession } from './session.js'
import { readSession, sessionCookie } from './session.js'

export type ResolvedSsoSession = {
  readonly session: PortalSession
  readonly cookies: readonly string[]
}

export async function resolveSsoSession(
  request: IncomingMessage,
): Promise<ResolvedSsoSession | null> {
  const session = readSession(request)
  if (!session) return null
  if (!sessionNeedsRefresh(session)) return { session, cookies: [] }

  const refreshed = await refreshPortalSession(session)
  return { session: refreshed, cookies: [sessionCookie(refreshed)] }
}

export function sessionHeaders(resolved: ResolvedSsoSession): Record<string, readonly string[]> {
  return resolved.cookies.length > 0 ? { 'set-cookie': resolved.cookies } : {}
}
