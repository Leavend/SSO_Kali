import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { getConfig } from './config'
import {
  buildProxyResponseHeaders,
  resolveBffRequestId,
  deriveSupportReference,
} from './proxy-headers'
import type { AppResponse } from './response'
import { json } from './response'
import type { PortalSession } from './session'
import { clearSessionCookie, replaceSession } from './session'
import { resolveSsoSession, sessionHeaders } from './sso-session-resolver'
import type { ResolvedSsoSession } from './sso-session-resolver'

const ADMIN_BFF_PREFIX = '/api/admin'
const ADMIN_BACKEND_PREFIX = '/admin/api'

const ALLOWED_ADMIN_ROUTES = new Set([
  'GET /api/admin/me',
  'GET /api/admin/oidc-foundation',
  'GET /api/admin/dashboard/summary',
  'GET /api/admin/clients',
  'GET /api/admin/users',
  'POST /api/admin/users',
  'GET /api/admin/audit/events',
  'GET /api/admin/audit/authentication-events',
  'GET /api/admin/audit/integrity',
  'GET /api/admin/audit/retention',
  'GET /api/admin/audit/export',
  'GET /api/admin/observability/summary',
  'GET /api/admin/compliance/evidence-pack',
  'GET /api/admin/data-subject-requests',
  'GET /api/admin/roles',
  'GET /api/admin/permissions',
  'POST /api/admin/roles',
  'GET /api/admin/sessions',
  'GET /api/admin/ip-access-rules',
  'POST /api/admin/ip-access-rules',
  'GET /api/admin/sso-error-templates',
  'GET /api/admin/external-idps',
  'POST /api/admin/external-idps',
  'GET /api/admin/ops/readiness',
  'GET /api/admin/client-integrations/registrations',
  'POST /api/admin/client-integrations',
  'POST /api/admin/client-integrations/stage',
  'GET /api/admin/scopes',
])
const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'content-type', 'x-request-id'])
const CLIENT_ID_PATTERN = '[a-z0-9-]+'
const SUBJECT_ID_PATTERN = '[a-zA-Z0-9_-]+'
const AUDIT_EVENT_ID_PATTERN = '[A-Z0-9]+'
const DSR_REQUEST_ID_PATTERN = '[0-9A-HJKMNP-TV-Z]+'
const POLICY_CATEGORY_PATTERN = '[a-z_]+'
const POLICY_VERSION_PATTERN = '[0-9]+'
const ROLE_SLUG_PATTERN = '[a-z0-9_-]+'
const PROVIDER_KEY_PATTERN = '[a-z0-9_-]+'
const SESSION_ID_PATTERN = '[a-zA-Z0-9_-]+'
const NUMERIC_ID_PATTERN = '[0-9]+'
const ERROR_TEMPLATE_KEY_PATTERN = '[a-z0-9_-]+'
const ALLOWED_ADMIN_ROUTE_PATTERNS: readonly RegExp[] = [
  new RegExp(`^GET /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^PATCH /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^DELETE /api/admin/clients/${CLIENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^PUT /api/admin/clients/${CLIENT_ID_PATTERN}/scopes$`, 'u'),
  new RegExp(`^POST /api/admin/clients/${CLIENT_ID_PATTERN}/rotate-secret$`, 'u'),
  new RegExp(`^POST /api/admin/client-integrations/${CLIENT_ID_PATTERN}/disable$`, 'u'),
  new RegExp(`^POST /api/admin/client-integrations/${CLIENT_ID_PATTERN}/decommission$`, 'u'),
  new RegExp(`^GET /api/admin/users/${SUBJECT_ID_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/lock$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/unlock$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/deactivate$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/reactivate$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/password-reset$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/reset-mfa$`, 'u'),
  new RegExp(`^POST /api/admin/users/${SUBJECT_ID_PATTERN}/sync-profile$`, 'u'),
  new RegExp(`^DELETE /api/admin/users/${SUBJECT_ID_PATTERN}/sessions$`, 'u'),
  new RegExp(`^PUT /api/admin/users/${SUBJECT_ID_PATTERN}/roles$`, 'u'),
  new RegExp(`^GET /api/admin/sessions/${SESSION_ID_PATTERN}$`, 'u'),
  new RegExp(`^DELETE /api/admin/sessions/${SESSION_ID_PATTERN}$`, 'u'),
  new RegExp(`^GET /api/admin/audit/events/${AUDIT_EVENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^GET /api/admin/audit/authentication-events/${AUDIT_EVENT_ID_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/data-subject-requests/${DSR_REQUEST_ID_PATTERN}/review$`, 'u'),
  new RegExp(`^POST /api/admin/data-subject-requests/${DSR_REQUEST_ID_PATTERN}/fulfill$`, 'u'),
  new RegExp(`^GET /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}$`, 'u'),
  new RegExp(
    `^POST /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}/${POLICY_VERSION_PATTERN}/activate$`,
    'u',
  ),
  new RegExp(
    `^POST /api/admin/security-policies/${POLICY_CATEGORY_PATTERN}/${POLICY_VERSION_PATTERN}/rollback$`,
    'u',
  ),
  new RegExp(`^PATCH /api/admin/roles/${ROLE_SLUG_PATTERN}$`, 'u'),
  new RegExp(`^PUT /api/admin/roles/${ROLE_SLUG_PATTERN}/permissions$`, 'u'),
  new RegExp(`^DELETE /api/admin/roles/${ROLE_SLUG_PATTERN}$`, 'u'),
  new RegExp(`^DELETE /api/admin/ip-access-rules/${NUMERIC_ID_PATTERN}$`, 'u'),
  new RegExp(`^GET /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}$`, 'u'),
  new RegExp(`^PUT /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/sso-error-templates/${ERROR_TEMPLATE_KEY_PATTERN}/reset$`, 'u'),
  new RegExp(`^GET /api/admin/external-idps/${PROVIDER_KEY_PATTERN}$`, 'u'),
  new RegExp(`^PATCH /api/admin/external-idps/${PROVIDER_KEY_PATTERN}$`, 'u'),
  new RegExp(`^POST /api/admin/external-idps/${PROVIDER_KEY_PATTERN}/mapping-preview$`, 'u'),
  new RegExp(`^DELETE /api/admin/external-idps/${PROVIDER_KEY_PATTERN}$`, 'u'),
]

export type AdminApiRequestOptions = {
  readonly internalBaseUrl: string
  readonly pathname: string
  readonly search: string
  readonly method: string
  readonly headers: IncomingHttpHeaders
  readonly session: PortalSession
  readonly body?: RequestInit['body']
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
    if (isAllowedAdminPath(options.pathname))
      throw new Error('Admin API proxy method is not allowed.')
    throw new Error('Admin API proxy path is not allowed.')
  }

  const backendPath =
    options.pathname === '/api/admin/ops/readiness'
      ? '/ready'
      : `${ADMIN_BACKEND_PREFIX}${options.pathname.slice(ADMIN_BFF_PREFIX.length)}`
  const requestHeaders = buildAdminApiHeaders(options.headers, options.session.accessToken)

  return {
    url: `${trimTrailingSlash(options.internalBaseUrl)}${backendPath}${options.search}`,
    init: {
      method,
      headers: requestHeaders,
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

  if (!isBootstrapPrincipalRequest(context) && resolved.session.role !== 'admin') {
    return json(
      403,
      { error: 'forbidden', message: 'Admin role is required to access this resource.' },
      sessionHeaders(resolved),
    )
  }

  let adminRequest: AdminApiRequest
  try {
    adminRequest = buildAdminApiRequest({
      internalBaseUrl: getConfig().internalBaseUrl,
      pathname: context.requestUrl.pathname,
      search: context.requestUrl.search,
      method: context.request.method ?? 'GET',
      headers: context.request.headers,
      session: resolved.session,
      body: context.request as unknown as RequestInit['body'],
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const reqId = resolveBffRequestId(context.request.headers)
    const supportRef = deriveSupportReference(reqId)

    console.error('[ADMIN_BFF_PROXY_POLICY]', {
      request_id: reqId,
      support_reference: supportRef,
      path: context.requestUrl.pathname,
      method: context.request.method,
      error: msg,
    })

    return json(
      400,
      {
        error: 'proxy_policy_error',
        message: msg,
        request_id: reqId,
        support_reference: supportRef,
      },
      sessionHeaders(resolved),
    )
  }

  try {
    const response = await fetch(adminRequest.url, adminRequest.init)
    const body = Buffer.from(await response.arrayBuffer())
    if (response.ok && isBootstrapPrincipalRequest(context)) {
      await refreshCachedRoleFromPrincipalResponse(resolved, body)
    }

    return {
      status: response.status,
      headers: { ...buildProxyResponseHeaders(response.headers), ...sessionHeaders(resolved) },
      body,
    }
  } catch (error) {
    const reqId = resolveBffRequestId(context.request.headers)
    const supportRef = deriveSupportReference(reqId)
    const bffError = error instanceof Error ? error.message : String(error)

    console.error('[ADMIN_BFF_PROXY_502]', {
      request_id: reqId,
      support_reference: supportRef,
      path: context.requestUrl.pathname,
      method: context.request.method,
      error: bffError,
    })

    return json(
      502,
      {
        error: 'admin_proxy_failed',
        message: supportRef
          ? `Backend service unreachable. Incident reference: ${supportRef} (check server logs).`
          : 'Backend service unreachable.',
        request_id: reqId,
        support_reference: supportRef,
      },
      sessionHeaders(resolved),
    )
  }
}

function isBootstrapPrincipalRequest(context: {
  readonly request: IncomingMessage
  readonly requestUrl: URL
}): boolean {
  return (
    context.requestUrl.pathname === '/api/admin/me' &&
    (context.request.method ?? 'GET').toUpperCase() === 'GET'
  )
}

async function refreshCachedRoleFromPrincipalResponse(
  resolved: ResolvedSsoSession,
  body: Buffer,
): Promise<void> {
  const role = roleFromPrincipalBody(body)
  if (!role || role === resolved.session.role) return

  await replaceSession(resolved.sessionId, { ...resolved.session, role }).catch(
    (error: unknown) => {
      console.error(
        'Admin session role refresh failed:',
        error instanceof Error ? error.message : error,
      )
    },
  )
}

function roleFromPrincipalBody(body: Buffer): string | null {
  try {
    const data = JSON.parse(body.toString('utf8')) as unknown
    if (!isRecord(data)) return null
    const principal = data.principal
    if (!isRecord(principal)) return null
    return typeof principal.role === 'string' && principal.role !== '' ? principal.role : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
  forwarded.set('Accept-Encoding', 'identity')
  forwarded.set('Authorization', `Bearer ${accessToken}`)
  forwarded.set('X-Request-Id', resolveBffRequestId(headers))

  return forwarded
}

function isAllowedAdminRoute(routeKey: string): boolean {
  return (
    ALLOWED_ADMIN_ROUTES.has(routeKey) ||
    ALLOWED_ADMIN_ROUTE_PATTERNS.some((pattern) => pattern.test(routeKey))
  )
}

function isAllowedAdminPath(pathname: string): boolean {
  return (
    isAllowedAdminRoute(`GET ${pathname}`) ||
    isAllowedAdminRoute(`PATCH ${pathname}`) ||
    isAllowedAdminRoute(`POST ${pathname}`) ||
    isAllowedAdminRoute(`PUT ${pathname}`) ||
    isAllowedAdminRoute(`DELETE ${pathname}`)
  )
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
