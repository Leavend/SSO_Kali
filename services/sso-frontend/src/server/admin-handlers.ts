import type { IncomingMessage } from 'node:http'
import { REAUTH_REQUIRED_ROUTE, legacyAuthErrorRoute } from '../shared/auth-status.js'
import type { AdminDashboardPayload } from '../shared/admin.js'
import {
  buildClientIntegrationContract,
  activateClientIntegration,
  disableClientIntegration,
  fetchClientIntegrationRegistrations,
  fetchClients,
  fetchDashboardSummary,
  fetchPrincipal,
  fetchSessions,
  fetchUser,
  fetchUsers,
  revokeSession,
  revokeUserSessions,
  stageClientIntegration,
} from './admin-api.js'
import { exportAuditEvents, fetchAuditEvents, fetchAuditIntegrity } from './admin-audit-api.js'
import {
  decommissionClient,
  rotateClientSecret,
  syncClientScopes,
  updateClient,
} from './admin-client-api.js'
import { createUser, userLifecycleAction } from './admin-user-api.js'
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

    if (pathname === '/api/admin/dashboard/summary' && method === 'GET') {
      return json(200, await fetchDashboardSummary(session), headers)
    }

    if (pathname === '/api/admin/dashboard' && method === 'GET') {
      return json(200, await dashboardPayload(session), headers)
    }

    if (pathname === '/api/admin/users' && method === 'POST') {
      return adminUserCreate(context.request, session, headers)
    }

    if (pathname === '/api/admin/users' && method === 'GET') {
      return json(200, { users: await fetchUsers(session) }, headers)
    }

    if (
      pathname.startsWith('/api/admin/users/') &&
      pathname.endsWith('/sessions') &&
      method === 'DELETE'
    ) {
      return revokeAllUserSessions(session, pathname, headers)
    }

    if (pathname.startsWith('/api/admin/users/') && method === 'POST') {
      return adminUserLifecycle(context.request, pathname, session, headers)
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

    if (
      pathname.startsWith('/api/admin/clients/') &&
      ['PATCH', 'POST', 'PUT', 'DELETE'].includes(method)
    ) {
      return adminClientMutation(context.request, pathname, method, session, headers)
    }

    if (pathname === '/api/admin/audit/events' && method === 'GET') {
      return json(200, await fetchAuditEvents(session, context.requestUrl.search), headers)
    }

    if (pathname === '/api/admin/audit/integrity' && method === 'GET') {
      return json(200, await fetchAuditIntegrity(session), headers)
    }

    if (pathname === '/api/admin/audit/export' && method === 'GET') {
      const exported = await exportAuditEvents(session, context.requestUrl.search)
      return { status: 200, headers: { ...headers, ...exported.headers }, body: exported.body }
    }

    if (pathname === '/api/admin/client-integrations/contract' && method === 'POST') {
      return clientIntegrationContract(context.request, session, headers)
    }

    if (pathname === '/api/admin/client-integrations/registrations' && method === 'GET') {
      return json(
        200,
        { registrations: await fetchClientIntegrationRegistrations(session) },
        headers,
      )
    }

    if (pathname === '/api/admin/client-integrations/stage' && method === 'POST') {
      return clientIntegrationStage(context.request, session, headers)
    }

    if (pathname.startsWith('/api/admin/client-integrations/') && method === 'POST') {
      return clientIntegrationLifecycle(context, session, headers)
    }

    return json(404, { error: 'not_found', message: 'Admin endpoint not found.' }, headers)
  } catch (error) {
    return adminErrorResponse(error)
  }
}

async function adminUserCreate(
  request: IncomingMessage,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const body = await readJsonBody(request)
  if (!body) return json(400, { error: 'invalid_json', message: 'Invalid user payload.' }, headers)

  return json(201, await createUser(session, body), headers)
}

async function adminUserLifecycle(
  request: IncomingMessage,
  pathname: string,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const parsed = userLifecyclePath(pathname)
  if (!parsed)
    return json(404, { error: 'not_found', message: 'Admin endpoint not found.' }, headers)
  const body = await readJsonBody(request)
  if (!body)
    return json(400, { error: 'invalid_json', message: 'Invalid user action payload.' }, headers)

  return json(
    200,
    await userLifecycleAction(session, parsed.subjectId, parsed.action, body),
    headers,
  )
}

async function adminClientMutation(
  request: IncomingMessage,
  pathname: string,
  method: string,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const parsed = clientMutationPath(pathname)
  if (!parsed)
    return json(404, { error: 'not_found', message: 'Admin endpoint not found.' }, headers)
  const body = await readJsonBody(request)

  if (parsed.action === 'base' && method === 'PATCH')
    return json(200, await updateClient(session, parsed.clientId, body ?? {}), headers)
  if (parsed.action === 'rotate-secret' && method === 'POST')
    return json(200, await rotateClientSecret(session, parsed.clientId), headers)
  if (parsed.action === 'scopes' && method === 'PUT')
    return json(200, await syncClientScopes(session, parsed.clientId, body ?? {}), headers)
  if (parsed.action === 'base' && method === 'DELETE')
    return json(200, await decommissionClient(session, parsed.clientId), headers)

  return json(404, { error: 'not_found', message: 'Admin endpoint not found.' }, headers)
}

async function clientIntegrationStage(
  request: IncomingMessage,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const body = await readJsonBody(request)
  if (!body)
    return json(
      400,
      { error: 'invalid_json', message: 'Invalid client integration payload.' },
      headers,
    )

  return json(200, { registration: await stageClientIntegration(session, body) }, headers)
}

async function clientIntegrationLifecycle(
  context: RouteContext,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const action = lifecycleAction(context.requestUrl.pathname)
  if (action === null)
    return json(404, { error: 'not_found', message: 'Admin endpoint not found.' }, headers)

  return json(
    200,
    { registration: await runLifecycleAction(context.request, session, action) },
    headers,
  )
}

function lifecycleAction(pathname: string): ClientLifecycleAction | null {
  const match = pathname.match(
    /^\/api\/admin\/client-integrations\/([a-z0-9-]+)\/(activate|disable)$/,
  )
  if (!match) return null

  return { clientId: match[1] ?? '', action: match[2] === 'activate' ? 'activate' : 'disable' }
}

async function runLifecycleAction(
  request: IncomingMessage,
  session: AdminSession,
  action: ClientLifecycleAction,
): ReturnType<typeof activateClientIntegration> {
  if (action.action === 'disable') return disableClientIntegration(session, action.clientId)
  const body = await readJsonBody(request)
  return activateClientIntegration(session, action.clientId, secretHashFrom(body))
}

function secretHashFrom(body: Record<string, unknown> | null): string | null {
  return typeof body?.secretHash === 'string' && body.secretHash !== '' ? body.secretHash : null
}

type ClientLifecycleAction = Readonly<{
  clientId: string
  action: 'activate' | 'disable'
}>

function userLifecyclePath(
  pathname: string,
): { readonly subjectId: string; readonly action: string } | null {
  const match = pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/(deactivate|reactivate|password-reset|sync-profile|lock|unlock|reset-mfa)$/,
  )
  if (!match) return null
  return { subjectId: decodeURIComponent(match[1] ?? ''), action: match[2] ?? '' }
}

function clientMutationPath(
  pathname: string,
): { readonly clientId: string; readonly action: string } | null {
  const match = pathname.match(/^\/api\/admin\/clients\/([^/]+)(?:\/(rotate-secret|scopes))?$/)
  if (!match) return null
  return { clientId: decodeURIComponent(match[1] ?? ''), action: match[2] ?? 'base' }
}

async function clientIntegrationContract(
  request: IncomingMessage,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const body = await readJsonBody(request)
  if (!body) {
    return json(
      400,
      { error: 'invalid_json', message: 'Invalid client integration payload.' },
      headers,
    )
  }

  return json(200, { contract: await buildClientIntegrationContract(session, body) }, headers)
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
    return json(
      403,
      { error: 'forbidden', message: 'Session management permission is required.' },
      headers,
    )
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
    return json(
      403,
      { error: 'forbidden', message: 'Session management permission is required.' },
      headers,
    )
  }

  const subjectId = decodeURIComponent(
    pathname.slice('/api/admin/users/'.length, -'/sessions'.length).replace(/\/$/, ''),
  )
  await revokeUserSessions(session, subjectId)
  return json(200, { status: 'revoked' }, headers)
}

async function resolveSessionOrNull(
  request: IncomingMessage,
): Promise<ResolvedAdminSession | null> {
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

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const body = await readLimitedBody(request)
    const payload = body === '' ? {} : (JSON.parse(body) as unknown)
    return isRecord(payload) ? payload : null
  } catch {
    return null
  }
}

async function readLimitedBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 16_384) throw new Error('Admin payload too large.')
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
      return json(error.status, adminErrorPayload(error), { 'set-cookie': [clearSessionCookie()] })
    }

    return json(error.status, adminErrorPayload(error))
  }

  console.error(error)
  return json(500, { error: 'admin_proxy_failed', message: 'Admin API proxy failed.' })
}

function adminErrorPayload(error: {
  readonly code: string | null
  readonly message: string
  readonly violations: readonly string[]
}): {
  readonly error: string
  readonly message: string
  readonly violations?: readonly string[]
} {
  const payload = {
    error: error.code ?? 'admin_api_error',
    message: error.message,
  }

  return error.violations.length > 0 ? { ...payload, violations: error.violations } : payload
}

function unauthenticatedResponse(): AppResponse {
  return json(
    401,
    { error: 'no_session', message: 'No active admin session.' },
    { 'set-cookie': [clearSessionCookie()] },
  )
}
