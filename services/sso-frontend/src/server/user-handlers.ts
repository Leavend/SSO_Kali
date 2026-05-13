import type { IncomingMessage } from 'node:http'
import { REAUTH_REQUIRED_ROUTE, legacyAuthErrorRoute } from '../shared/auth-status.js'
import type { ProfileUpdatePayload } from '../shared/user.js'
import {
  fetchConnectedApps,
  fetchMySessions,
  fetchProfile,
  revokeConnectedApp,
  revokeMySession,
  updateProfile,
} from './user-api.js'
import { isUserApiError } from './user-api-error.js'
import { resolveSsoSession, sessionHeaders } from './sso-session-resolver.js'
import type { ResolvedSsoSession } from './sso-session-resolver.js'
import { getConfig } from './config.js'
import { clearSessionCookie, publicSession } from './session.js'
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

  return json(200, { principal: publicSession(resolved.session) }, sessionHeaders(resolved))
}

export async function handleUserApi(context: RouteContext): Promise<AppResponse> {
  const resolved = await resolveSessionOrNull(context.request)
  if (!resolved) return unauthenticatedResponse()

  const session = resolved.session
  const headers = sessionHeaders(resolved)

  try {
    const pathname = context.requestUrl.pathname
    const method = context.request.method ?? 'GET'

    if (pathname === '/api/me/profile' && method === 'GET') {
      return json(200, await fetchProfile(session), headers)
    }

    if (pathname === '/api/me/profile' && method === 'PATCH') {
      return updateProfileEndpoint(context.request, session, headers)
    }

    if (pathname === '/api/me/connected-apps' && method === 'GET') {
      return json(200, { connected_apps: await fetchConnectedApps(session) }, headers)
    }

    if (pathname.startsWith('/api/me/connected-apps/') && method === 'DELETE') {
      return revokeConnectedAppEndpoint(session, pathname, headers)
    }

    if (pathname === '/api/me/sessions' && method === 'GET') {
      return json(200, { sessions: await fetchMySessions(session) }, headers)
    }

    if (pathname.startsWith('/api/me/sessions/') && method === 'DELETE') {
      return revokeMySessionEndpoint(session, pathname, headers)
    }

    return json(404, { error: 'not_found', message: 'Endpoint not found.' }, headers)
  } catch (error) {
    return userErrorResponse(error)
  }
}

export function redirectForLegacyError(requestUrl: URL): AppResponse | null {
  const legacyError = requestUrl.searchParams.get('error')
  if (!legacyError) return null

  const route = legacyAuthErrorRoute(legacyError) ?? '/'
  return redirect(new URL(route, getConfig().appBaseUrl).toString(), [clearSessionCookie()])
}

async function updateProfileEndpoint(
  request: IncomingMessage,
  session: AdminSession,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const body = await readJsonBody(request)
  if (!body) return json(400, { error: 'invalid_json', message: 'Invalid profile payload.' }, headers)

  const payload: ProfileUpdatePayload = {
    ...(typeof body.display_name === 'string' ? { display_name: body.display_name } : {}),
    ...(typeof body.given_name === 'string' ? { given_name: body.given_name } : {}),
    ...(typeof body.family_name === 'string' ? { family_name: body.family_name } : {}),
  }

  return json(200, await updateProfile(session, payload), headers)
}

async function revokeConnectedAppEndpoint(
  session: AdminSession,
  pathname: string,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const clientId = decodeURIComponent(pathname.slice('/api/me/connected-apps/'.length))
  if (!clientId) return json(400, { error: 'invalid_request', message: 'Client id is required.' }, headers)

  await revokeConnectedApp(session, clientId)
  return json(200, { status: 'revoked', client_id: clientId }, headers)
}

async function revokeMySessionEndpoint(
  session: AdminSession,
  pathname: string,
  headers: Record<string, HeaderValue>,
): Promise<AppResponse> {
  const sessionId = decodeURIComponent(pathname.slice('/api/me/sessions/'.length))
  if (!sessionId) return json(400, { error: 'invalid_request', message: 'Session id is required.' }, headers)

  await revokeMySession(session, sessionId)
  return json(200, { status: 'revoked', session_id: sessionId }, headers)
}

async function resolveSessionOrNull(request: IncomingMessage): Promise<ResolvedSsoSession | null> {
  try {
    return await resolveSsoSession(request)
  } catch (error) {
    console.error('SSO session refresh failed:', error instanceof Error ? error.message : error)
    return null
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  try {
    const body = await readLimitedBody(request)
    const payload = body === '' ? {} : JSON.parse(body) as unknown
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
    if (size > 16_384) throw new Error('SSO payload too large.')
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function userErrorResponse(error: unknown): AppResponse {
  if (isUserApiError(error)) {
    if (error.status === 401) {
      return json(error.status, userErrorPayload(error, REAUTH_REQUIRED_ROUTE), { 'set-cookie': [clearSessionCookie()] })
    }

    return json(error.status, userErrorPayload(error))
  }

  console.error(error)
  return json(500, { error: 'sso_proxy_failed', message: 'SSO API proxy failed.' })
}

function userErrorPayload(
  error: { readonly code: string | null; readonly message: string; readonly violations: readonly string[] },
  redirectTo?: string,
): {
  readonly error: string
  readonly message: string
  readonly violations?: readonly string[]
  readonly redirectTo?: string
} {
  const base = {
    error: error.code ?? 'sso_api_error',
    message: error.message,
  }
  const withRedirect = redirectTo ? { ...base, redirectTo } : base

  return error.violations.length > 0 ? { ...withRedirect, violations: error.violations } : withRedirect
}

function unauthenticatedResponse(): AppResponse {
  return json(
    401,
    { error: 'no_session', message: 'No active SSO session.', redirectTo: '/' },
    { 'set-cookie': [clearSessionCookie()] },
  )
}
