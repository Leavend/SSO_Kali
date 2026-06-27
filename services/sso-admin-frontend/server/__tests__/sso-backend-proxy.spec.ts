import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxyToSsoBackend } from '../utils/sso-backend-proxy'
import { shouldProxyAdminWidgetPath } from '../utils/widget-routes'

const fetchMock = vi.fn<typeof fetch>()

describe('shouldProxyAdminWidgetPath', () => {
  it('accepts /widget/* paths', () => {
    expect(shouldProxyAdminWidgetPath('/widget/accounts')).toBe(true)
    expect(shouldProxyAdminWidgetPath('/widget/apps')).toBe(true)
    expect(shouldProxyAdminWidgetPath('/widget/switch')).toBe(true)
    expect(shouldProxyAdminWidgetPath('/widget/logout')).toBe(true)
    expect(shouldProxyAdminWidgetPath('/widget/session')).toBe(true)
  })

  it('rejects non-widget paths', () => {
    expect(shouldProxyAdminWidgetPath('/widget')).toBe(false)
    expect(shouldProxyAdminWidgetPath('/api/admin/users')).toBe(false)
    expect(shouldProxyAdminWidgetPath('/token')).toBe(false)
    expect(shouldProxyAdminWidgetPath('/dashboard')).toBe(false)
    expect(shouldProxyAdminWidgetPath('/widgets/accounts')).toBe(false)
  })
})

describe('proxyToSsoBackend', () => {
  beforeEach(() => {
    vi.stubEnv('SSO_INTERNAL_BASE_URL', 'https://api-sso.test')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('forwards method, path, query, and the browser session cookie to the backend widget endpoint', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ accounts: [] }, { status: 200 }))

    await proxyToSsoBackend(
      widgetRequest('GET', '__Host-sso_session=session-1'),
      new URL('https://admin-sso.test/widget/accounts?limit=5'),
    )

    const [target, init] = fetchMock.mock.calls[0] ?? []
    expect(String(target)).toBe('https://api-sso.test/widget/accounts?limit=5')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('cookie')).toBe('__Host-sso_session=session-1')
  })

  it('relays the backend status, content-type, and Set-Cookie back to the admin origin', async () => {
    const upstream = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    upstream.append(
      'set-cookie',
      '__Host-sso_session=rotated; Path=/; Secure; HttpOnly; SameSite=Lax',
    )
    fetchMock.mockResolvedValueOnce(
      new Response('{"success":true}', { status: 200, headers: upstream }),
    )

    const response = await proxyToSsoBackend(
      widgetRequest('POST', '__Host-sso_session=session-1'),
      new URL('https://admin-sso.test/widget/switch'),
    )

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8')
    expect(response.headers?.['set-cookie']).toEqual([
      '__Host-sso_session=rotated; Path=/; Secure; HttpOnly; SameSite=Lax',
    ])
  })

  it('does not forward a request body for GET requests', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ accounts: [] }, { status: 200 }))

    await proxyToSsoBackend(
      widgetRequest('GET', '__Host-sso_session=session-1'),
      new URL('https://admin-sso.test/widget/accounts'),
    )

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.body).toBeUndefined()
  })

  it('preserves upstream redirects instead of following them', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('', { status: 302, headers: { location: 'https://sso.test/login' } }),
    )

    const response = await proxyToSsoBackend(
      widgetRequest('POST', '__Host-sso_session=session-1'),
      new URL('https://admin-sso.test/widget/switch'),
    )
    const [, init] = fetchMock.mock.calls[0] ?? []

    expect(init).toMatchObject({ redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers?.location).toBe('https://sso.test/login')
  })
})

function widgetRequest(method: string, cookie: string): IncomingMessage {
  return {
    method,
    headers: {
      cookie,
      'x-request-id': 'req-widget-proxy',
    },
  } as unknown as IncomingMessage
}
