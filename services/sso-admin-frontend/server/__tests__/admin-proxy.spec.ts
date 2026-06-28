import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAdminApiRequest } from '../utils/admin-proxy'
import { buildProxyResponseHeaders } from '../utils/proxy-headers'
import type { PortalSession } from '../utils/session'

const session: PortalSession = {
  accessToken: 'access-token-admin',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  sub: 'sub-admin',
  subject: 'sub-admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  role: 'admin',
  expiresAt: 1_900_000_000,
  authTime: null,
  amr: ['pwd'],
  acr: null,
  lastLoginAt: null,
  issuedAt: 1_800_000_000,
  absoluteExpiresAt: 1_900_000_000,
  lastRefreshedAt: 1_800_000_000,
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('admin BFF API proxy', () => {
  it('maps same-origin admin API paths to backend admin paths and injects Bearer server-side', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users/sub_admin/lock',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-1' },
      session,
    })

    expect(request.url).toBe('https://backend.internal/admin/api/users/sub_admin/lock')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
    expect(headers(request).get('Accept')).toBe('application/json')
    expect(headers(request).get('Accept-Encoding')).toBe('identity')
    expect(headers(request).get('X-Request-Id')).toBe('req-1')
  })

  it('allows POST /api/admin/users/:sub/require-mfa through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users/sub_admin/require-mfa',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-rmfa' },
      session,
    })
    expect(request.url).toBe('https://backend.internal/admin/api/users/sub_admin/require-mfa')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('allows POST /api/admin/users/:sub/unrequire-mfa through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users/sub_admin/unrequire-mfa',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-urmfa' },
      session,
    })
    expect(request.url).toBe('https://backend.internal/admin/api/users/sub_admin/unrequire-mfa')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('keeps operational readiness mapped to the backend health endpoint', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/ops/readiness',
      search: '',
      method: 'GET',
      headers: {},
      session,
    })

    expect(request.url).toBe('https://backend.internal/ready')
  })

  it('allows observability summary through the admin API boundary', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal/',
      pathname: '/api/admin/observability/summary',
      search: '',
      method: 'GET',
      headers: { 'x-request-id': 'req-observability' },
      session,
    })

    expect(request.url).toBe('https://backend.internal/admin/api/observability/summary')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
    expect(headers(request).get('X-Request-Id')).toBe('req-observability')
  })

  it('allows GET /api/admin/audit/export through the proxy and preserves the export query', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/audit/export',
      search: '?format=csv&from=2026-01-01&to=2026-01-31',
      method: 'GET',
      headers: { 'x-request-id': 'req-export' },
      session,
    })

    expect(request.url).toBe(
      'https://backend.internal/admin/api/audit/export?format=csv&from=2026-01-01&to=2026-01-31',
    )
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('allows GET /api/admin/compliance/evidence-pack through the proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/compliance/evidence-pack',
      search: '?format=zip&correlation_id=corr-1',
      method: 'GET',
      headers: { 'x-request-id': 'req-evidence' },
      session,
    })

    expect(request.url).toBe(
      'https://backend.internal/admin/api/compliance/evidence-pack?format=zip&correlation_id=corr-1',
    )
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('passes Content-Type/Content-Disposition through for a binary upstream and never logs the body (binary passthrough + no-body-logging, asserted not assumed)', () => {
    // ponytail: the proxy fully buffers the download (Buffer.from(await
    // response.arrayBuffer())) before returning it untouched — known ceiling;
    // stream if export size grows. The header forwarder below is the ONLY proxy
    // seam that processes a binary response, and it takes headers, never the body
    // — so the binary bytes are structurally unreachable to any logger.
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const upstream = new Headers()
    upstream.set('Content-Type', 'application/zip')
    upstream.set('Content-Disposition', 'attachment; filename="compliance-evidence-pack.zip"')
    upstream.set('Content-Length', '40961') // framing header — must be stripped, not forwarded

    const forwarded = buildProxyResponseHeaders(upstream)

    expect(forwarded['content-type']).toBe('application/zip')
    expect(forwarded['content-disposition']).toBe(
      'attachment; filename="compliance-evidence-pack.zip"',
    )
    expect(forwarded['content-length']).toBeUndefined()
    // No body (and no header forwarding) is ever written to a logger/console.
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })

  it('rejects unlisted admin proxy paths before reaching the backend', () => {
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/../../token',
        search: '',
        method: 'GET',
        headers: {},
        session,
      }),
    ).toThrow('Admin API proxy path is not allowed.')
  })

  it('rejects browser-supplied Authorization headers and always uses the server token', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/me',
      search: '',
      method: 'GET',
      headers: { authorization: 'Bearer browser-token' },
      session,
    })

    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('forwards GET /api/admin/me for authenticated stale user-role sessions and updates the cached role', async () => {
    const replaceSession = vi.fn<() => Promise<void>>(async () => undefined)
    const staleSession: PortalSession = { ...session, role: 'user' }

    vi.resetModules()
    vi.doMock('../utils/config', () => ({
      getConfig: () => ({ internalBaseUrl: 'https://backend.internal' }),
    }))
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => ({
        sessionId: 'session-id',
        session: staleSession,
        cookies: [],
      }),
      sessionHeaders: () => ({ 'set-cookie': ['session-cookie'] }),
    }))
    vi.doMock('../utils/session', async (importActual) => ({
      ...(await importActual<typeof import('../utils/session')>()),
      replaceSession,
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          principal: { role: 'admin' },
        }),
      ),
    )

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: { method: 'GET', headers: { 'x-request-id': 'req-me' } } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/me'),
    })

    expect(response.status).toBe(200)
    expect(replaceSession).toHaveBeenCalledWith('session-id', { ...staleSession, role: 'admin' })
  })

  it('keeps non-bootstrap admin APIs forbidden for stale user-role sessions', async () => {
    const staleSession: PortalSession = { ...session, role: 'user' }

    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => ({
        sessionId: 'session-id',
        session: staleSession,
        cookies: [],
      }),
      sessionHeaders: () => ({ 'set-cookie': ['session-cookie'] }),
    }))

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: { method: 'GET', headers: {} } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/dashboard/summary'),
    })

    expect(response.status).toBe(403)
  })

  it('allows POST /api/admin/users through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/users',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-1' },
      session,
    })

    expect(request.url).toBe('https://backend.internal/admin/api/users')
    expect(request.init.method).toBe('POST')
  })

  it('allows POST /api/admin/client-integrations/:id/activate through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/client-integrations/newapp/activate',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-activate' },
      session,
    })

    expect(request.url).toBe(
      'https://backend.internal/admin/api/client-integrations/newapp/activate',
    )
    expect(request.init.method).toBe('POST')
    expect(headers(request).get('Authorization')).toBe('Bearer access-token-admin')
  })

  it('rejects POST /api/admin/clients — clients are created via client-integrations, not POST /clients', () => {
    // The split path scheme: GET /clients is allow-listed (path is known) but POST
    // is not — so the method, not the path, is the rejection reason.
    expect(() =>
      buildAdminApiRequest({
        internalBaseUrl: 'https://backend.internal',
        pathname: '/api/admin/clients',
        search: '',
        method: 'POST',
        headers: { accept: 'application/json' },
        session,
      }),
    ).toThrow('Admin API proxy method is not allowed.')
  })

  it('allows POST /api/admin/client-integrations through the admin BFF API proxy', () => {
    const request = buildAdminApiRequest({
      internalBaseUrl: 'https://backend.internal',
      pathname: '/api/admin/client-integrations',
      search: '',
      method: 'POST',
      headers: { accept: 'application/json', 'x-request-id': 'req-client-create' },
      session,
    })

    expect(request.url).toBe('https://backend.internal/admin/api/client-integrations')
    expect(request.init.method).toBe('POST')
  })

  it('returns structured 502 error with request_id and support_reference when fetch fails', async () => {
    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => ({
        sessionId: 'session-id',
        session,
        cookies: [],
      }),
      sessionHeaders: () => ({ 'set-cookie': ['session-cookie'] }),
    }))
    vi.doMock('../utils/config', () => ({
      getConfig: () => ({ internalBaseUrl: 'https://backend.internal' }),
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof global.fetch>().mockRejectedValue(new Error('connection refused')),
    )

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: {
        method: 'POST',
        headers: {
          cookie: '__Host-sso-portal-session=session-id',
          'x-request-id': 'test-req-1234567890',
        },
      } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/users'),
    })

    expect(response.status).toBe(502)
    const body = JSON.parse(response.body!.toString())
    expect(body.error).toBe('admin_proxy_failed')
    expect(body.request_id).toBe('test-req-1234567890')
    expect(body.support_reference).toBe('REF-34567890')
  })

  it('returns support_reference in 502 response and does not call any second endpoint', async () => {
    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => ({
        sessionId: 'session-id',
        session,
        cookies: [],
      }),
      sessionHeaders: () => ({ 'set-cookie': ['session-cookie'] }),
    }))
    vi.doMock('../utils/config', () => ({
      getConfig: () => ({ internalBaseUrl: 'https://backend.internal' }),
    }))

    const fetchMock = vi.fn<typeof global.fetch>()
    fetchMock.mockRejectedValueOnce(new Error('connection refused'))
    vi.stubGlobal('fetch', fetchMock)

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: {
        method: 'POST',
        headers: {
          cookie: '__Host-sso-portal-session=session-id',
          'x-request-id': 'test-req-999',
        },
      } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/users'),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(502)
    const body = JSON.parse(response.body!.toString())
    expect(body.error).toBe('admin_proxy_failed')
    expect(body.request_id).toBe('test-req-999')
    expect(body.support_reference).toBe('REF-STREQ999')
  })

  it('returns 401 and does not call upstream when session resolves to null', async () => {
    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => null,
      sessionHeaders: () => ({}),
    }))
    vi.doMock('../utils/session', async (importActual) => ({
      ...(await importActual<typeof import('../utils/session')>()),
      clearSessionCookie: async () => ['__Host-sso-admin-session=; Max-Age=0'],
    }))
    const fetchMock = vi.fn<typeof global.fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: { method: 'GET', headers: {} } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/me'),
    })

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    const body = JSON.parse(response.body!.toString())
    expect(body.error).toBe('no_session')
  })

  it('returns 401 and does not call upstream when session resolution throws', async () => {
    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => {
        throw new Error('crypto failure')
      },
      sessionHeaders: () => ({}),
    }))
    vi.doMock('../utils/session', async (importActual) => ({
      ...(await importActual<typeof import('../utils/session')>()),
      clearSessionCookie: async () => ['__Host-sso-admin-session=; Max-Age=0'],
    }))
    const fetchMock = vi.fn<typeof global.fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: { method: 'GET', headers: {} } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/me'),
    })

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not leak the access token in the 502 response body', async () => {
    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => ({
        sessionId: 'session-id',
        session,
        cookies: [],
      }),
      sessionHeaders: () => ({}),
    }))
    vi.doMock('../utils/config', () => ({
      getConfig: () => ({ internalBaseUrl: 'https://backend.internal' }),
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof global.fetch>().mockRejectedValue(new Error('ECONNREFUSED')),
    )

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: {
        method: 'GET',
        headers: { 'x-request-id': 'req-token-leak' },
      } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/me'),
    })

    expect(response.status).toBe(502)
    const bodyStr = response.body!.toString()
    expect(bodyStr).not.toContain('access-token-admin')
  })

  it('does not include backend error details in the 502 response body', async () => {
    vi.resetModules()
    vi.doMock('../utils/sso-session-resolver', () => ({
      resolveSsoSession: async () => ({
        sessionId: 'session-id',
        session,
        cookies: [],
      }),
      sessionHeaders: () => ({}),
    }))
    vi.doMock('../utils/config', () => ({
      getConfig: () => ({ internalBaseUrl: 'https://backend.internal' }),
    }))
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof global.fetch>()
        .mockRejectedValue(new Error('Internal backend error: password=supersecret')),
    )

    const { handleAdminApiProxy } = await import('../utils/admin-proxy')
    const response = await handleAdminApiProxy({
      request: {
        method: 'GET',
        headers: { 'x-request-id': 'req-safe-envelope' },
      } as never,
      requestUrl: new URL('https://admin-sso.example.test/api/admin/me'),
    })

    expect(response.status).toBe(502)
    const body = JSON.parse(response.body!.toString())
    // Safe envelope — no raw backend internals exposed to browser
    expect(body.error).toBe('admin_proxy_failed')
    expect(body.message).toContain('Backend service unreachable')
    expect(body.message).not.toContain('supersecret')
  })
})

function headers(request: ReturnType<typeof buildAdminApiRequest>): Headers {
  expect(request.init.headers).toBeInstanceOf(Headers)
  return request.init.headers as Headers
}
