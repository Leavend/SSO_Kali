import type { IncomingMessage } from 'node:http'
import { REAUTH_REQUIRED_ROUTE, legacyAuthErrorRoute } from '../shared/auth-status.js'
import type { AdminDashboardPayload } from '../shared/admin.js'
import {
  fetchClients,
  fetchPrincipal,
  fetchSessions,
  fetchUser,
  fetchUsers,
  revokeSession,
  revokeUserSessions,
} from './admin-api.js'
import { isAdminApiError } from './admin-api-error.js'
import { resolveAdminSession, sessionHeaders } from './admin-session-resolver.js'
import type { ResolvedAdminSession } from './admin-session-resolver.js'
import { getConfig } from './config.js'
import { canManageSessions, canUseAdminPanel, sessionIsFresh } from './rbac.js'
import { clearSessionCookie, publicSession, sessionFromBootstrap } from './session.js'
import type { AdminSession } from './session.js'
import type { AppResponse } from './response.js'
import type { HeaderValue } from './response.js'
import { json, redirect } from './response.js'

type RouteContext = {
  readonly request: IncomingMessage
  readonly requestUrl: URL
}

export async function handleSession(request: IncomingMessage): Promise<AppResponse> {
  const resolved = await resolveSessionOrNull(request)
  if (!resolved) return unauthenticatedResponse()

  const session = resolved.session
  if (!canUseAdminPanel(session)) {
    return json(403, authFailurePayload(session), sessionHeaders(resolved))
  }

  return json(200, { principal: publicSession(session) }, sessionHeaders(resolved))
}

export async function handleAdminApi(context: RouteContext): Promise<AppResponse> {
  const resolved = await resolveSessionOrNull(context.request)
  if (!resolved) return unauthenticatedResponse()

  const session = resolved.session
  const headers = sessionHeaders(resolved)
  if (!canUseAdminPanel(session)) {
    return json(403, authFailurePayload(session), headers)
  }

  try {
    const pathname = context.requestUrl.pathname
    const method = context.request.method ?? 'GET'

    if (pathname === '/api/admin/dashboard' && method === 'GET') {
      return json(200, await dashboardPayload(session), headers)
    }

    if (pathname === '/api/admin/users' && method === 'GET') {
      return json(200, { users: await fetchUsers(session) }, headers)
    }

    if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/sessions') && method === 'DELETE') {
      return revokeAllUserSessions(session, pathname, headers)
    }

    if (pathname.startsWith('/api/admin/users/') && method === 'GET') {
      return json(200, await fetchUser(session, decodeTail(pathname, '/api/admin/users/')), headers)
    }

    if (pathname === '/api/admin/sessions' && method === 'GET') {
      return json(200, { sessions: await fetchSessions(session) }, headers)
    }

    if (pathname.startsWith('/api/admin/sessions/') && method === 'DELETE') {
      return revokeSingleSession(session, pathname, headers)
    }

    if (pathname === '/api/admin/clients' && method === 'GET') {
      return json(200, { clients: await fetchClients(session) }, headers)
    }

    return json(404, { error: 'not_found', message: 'Admin endpoint not found.' }, headers)
  } catch (error) {
    return adminErrorResponse(error)
  }
}

export function redirectForLegacyError(requestUrl: URL): AppResponse | null {
  const legacyError = requestUrl.searchParams.get('error')
  if (!legacyError) return null

  const route = legacyAuthErrorRoute(legacyError) ?? '/'
  return redirect(new URL(route, getConfig().appBaseUrl).toString(), [clearSessionCookie()])
}

async function dashboardPayload(session: AdminSession): Promise<AdminDashboardPayload> {
  const [principal, users, sessions, clients] = await Promise.all([
    fetchPrincipal(session),
    fetchUsers(session),
    fetchSessions(session),
    fetchClients(session),
  ])

  const refreshed = sessionFromBootstrap(
    {
      accessToken: session.accessToken,
      idToken: session.idToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    },
    principal,
  )

  return {
    principal: publicSession(refreshed),
    users,
    sessions,
    clients,
  }
}

async function revokeSingleSession(
  session: AdminSession,
  pathname: string,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  if (!canManageSessions(session)) {
    return json(403, { error: 'forbidden', message: 'Session management permission is required.' }, headers)
  }

  await revokeSession(session, decodeTail(pathname, '/api/admin/sessions/'))
  return json(200, { status: 'revoked' }, headers)
}

async function revokeAllUserSessions(
  session: AdminSession,
  pathname: string,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  if (!canManageSessions(session)) {
    return json(403, { error: 'forbidden', message: 'Session management permission is required.' }, headers)
  }

  const subjectId = decodeURIComponent(
    pathname.slice('/api/admin/users/'.length, -'/sessions'.length).replace(/\/$/, ''),
  )
  await revokeUserSessions(session, subjectId)
  return json(200, { status: 'revoked' }, headers)
}

async function resolveSessionOrNull(request: IncomingMessage): Promise<ResolvedAdminSession | null> {
  try {
    return await resolveAdminSession(request)
  } catch (error) {
    console.error('Admin session refresh failed:', error instanceof Error ? error.message : error)
    return null
  }
}

function decodeTail(pathname: string, prefix: string): string {
  return decodeURIComponent(pathname.slice(prefix.length))
}

function authFailurePayload(session: AdminSession): {
  readonly error: string
  readonly message: string
  readonly redirectTo: string
} {
  if (!sessionIsFresh(session)) {
    return {
      error: 'reauth_required',
      message: 'A fresh admin authentication is required.',
      redirectTo: REAUTH_REQUIRED_ROUTE,
    }
  }

  return {
    error: 'forbidden',
    message: 'Admin access is not allowed for this account.',
    redirectTo: '/access-denied',
  }
}

function adminErrorResponse(error: unknown): AppResponse {
  if (isAdminApiError(error)) {
    if (error.status === 401) {
      return json(error.status, {
        error: error.code ?? 'admin_api_error',
        message: error.message,
      }, { 'set-cookie': [clearSessionCookie()] })
    }

    return json(error.status, {
      error: error.code ?? 'admin_api_error',
      message: error.message,
    })
  }

  console.error(error)
  return json(500, { error: 'admin_proxy_failed', message: 'Admin API proxy failed.' })
}

function unauthenticatedResponse(): AppResponse {
  return json(
    401,
    { error: 'no_session', message: 'No active admin session.' },
    { 'set-cookie': [clearSessionCookie()] },
  )
}
