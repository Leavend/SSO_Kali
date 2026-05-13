import type { IncomingMessage } from 'node:http'
import { refreshSsoSession, sessionNeedsRefresh } from './session-refresh.js'
import type { SsoSession } from './session.js'
import { readSession, sessionCookie } from './session.js'

export type ResolvedSsoSession = {
  readonly session: SsoSession
  readonly cookies: readonly string[]
}

export async function resolveSsoSession(request: IncomingMessage): Promise<ResolvedSsoSession | null> {
  const session = readSession(request)
  if (!session) return null
  if (!sessionNeedsRefresh(session)) return { session, cookies: [] }

  const refreshed = await refreshSsoSession(session)
  return { session: refreshed, cookies: [sessionCookie(refreshed)] }
}

export function sessionHeaders(resolved: ResolvedSsoSession): Record<string, readonly string[]> {
  return resolved.cookies.length > 0 ? { 'set-cookie': resolved.cookies } : {}
}
