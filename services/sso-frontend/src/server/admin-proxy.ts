import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { getConfig } from './config.js'
import { buildProxyResponseHeaders } from './proxy-headers.js'
import type { AppResponse } from './response.js'
import { json } from './response.js'
import type { PortalSession } from './session.js'
import { clearSessionCookie } from './session.js'
import { resolveSsoSession, sessionHeaders } from './sso-session-resolver.js'
import type { ResolvedSsoSession } from './sso-session-resolver.js'

const ADMIN_BFF_PREFIX = '/api/admin'
const ADMIN_BACKEND_PREFIX = '/admin/api'
const ALLOWED_ADMIN_ROUTES = new Set([
  'GET /api/admin/me',
  'GET /api/admin/oidc-foundation',
  'GET /api/admin/dashboard/summary',
  'GET /api/admin/clients',
])
const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'x-request-id'])
const CLIENT_ID_PATTERN = '[a-z0-9-]+'
const ALLOWED_ADMIN_ROUTE_PATTERNS: readonly RegExp[] = [
  new RegExp(`^GET /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^PATCH /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/clients/${CLIENT_ID_PATTERN}/rotate-secret$`, 'u'),
]

export type AdminApiRequestOptions = {
  readonly internalBaseUrl: string
  readonly pathname: string
  readonly search: string
  readonly method: string
  readonly headers: IncomingHttpHeaders
  readonly session: PortalSession
  readonly body?: RequestInit['body'] | IncomingMessage
}

export type AdminApiRequest = {
  readonly url: string
  readonly init: RequestInit & { readonly duplex?: 'half' }
}

export function buildAdminApiRequest(options: AdminApiRequestOptions): AdminApiRequest {
  if (!options.pathname.startsWith(`${ADMIN_BFF_PREFIX}/`)) {
    throw new Error('Invalid admin API proxy path.')
  }

  const method = options.method.toUpperCase()
  const routeKey = `${method} ${options.pathname}`
  if (!isAllowedAdminRoute(routeKey)) {
    if (isAllowedAdminPath(options.pathname)) throw new Error('Admin API proxy method is not allowed.')
    throw new Error('Admin API proxy path is not allowed.')
  }

  const backendPath = `${ADMIN_BACKEND_PREFIX}${options.pathname.slice(ADMIN_BFF_PREFIX.length)}`
  const headers = buildAdminApiHeaders(options.headers, options.session.accessToken)

  return {
    url: `${trimTrailingSlash(options.internalBaseUrl)}${backendPath}${options.search}`,
    init: {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : options.body,
      ...(method === 'GET' || method === 'HEAD' ? {} : { duplex: 'half' as const }),
    },
  }
}

export async function handleAdminApiProxy(context: {
  readonly request: IncomingMessage
  readonly requestUrl: URL
}): Promise<AppResponse> {
  let resolved: ResolvedSsoSession | null
  try {
    resolved = await resolveSsoSession(context.request)
  } catch {
    return json(
      401,
      { error: 'no_session', message: 'No active SSO session.', redirectTo: '/' },
      { 'set-cookie': await clearSessionCookie(context.request) },
    )
  }

  if (!resolved) {
    return json(
      401,
      { error: 'no_session', message: 'No active SSO session.', redirectTo: '/' },
      { 'set-cookie': await clearSessionCookie(context.request) },
    )
  }

  if (resolved.session.role !== 'admin') {
    return json(
      403,
      { error: 'forbidden', message: 'Admin role is required to access this resource.' },
      sessionHeaders(resolved),
    )
  }

  try {
    const { url, init } = buildAdminApiRequest({
      internalBaseUrl: getConfig().internalBaseUrl,
      pathname: context.requestUrl.pathname,
      search: context.requestUrl.search,
      method: context.request.method ?? 'GET',
      headers: context.request.headers,
      session: resolved.session,
      body: context.request,
    })

    const response = await fetch(url, init)

    return {
      status: response.status,
      headers: { ...buildProxyResponseHeaders(response.headers), ...sessionHeaders(resolved) },
      body: Buffer.from(await response.arrayBuffer()),
    }
  } catch (error) {
    console.error('Admin API proxy failed:', error instanceof Error ? error.message : error)
    return json(502, { error: 'admin_proxy_failed', message: 'Admin API proxy failed.' }, sessionHeaders(resolved))
  }
}

function buildAdminApiHeaders(headers: IncomingHttpHeaders, accessToken: string): Headers {
  const forwarded = new Headers()

  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_REQUEST_HEADERS.has(name.toLowerCase())) continue
    if (Array.isArray(value)) {
      for (const item of value) forwarded.append(name, item)
    } else if (typeof value === 'string') {
      forwarded.set(name, value)
    }
  }

  forwarded.set('Accept', 'application/json')
  forwarded.set('Authorization', `Bearer ${accessToken}`)

  return forwarded
}

function isAllowedAdminRoute(routeKey: string): boolean {
  return ALLOWED_ADMIN_ROUTES.has(routeKey) || ALLOWED_ADMIN_ROUTE_PATTERNS.some((pattern) => pattern.test(routeKey))
}

function isAllowedAdminPath(pathname: string): boolean {
  return isAllowedAdminRoute(`GET ${pathname}`) ||
    isAllowedAdminRoute(`PATCH ${pathname}`) ||
    isAllowedAdminRoute(`POST ${pathname}`)
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
