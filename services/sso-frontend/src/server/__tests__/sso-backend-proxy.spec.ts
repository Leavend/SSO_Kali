import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxyToSsoBackend } from '../sso-backend-proxy.js'

const fetchMock = vi.fn<typeof fetch>()

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

  it('preserves upstream redirects instead of following them', async () => {
    const upstreamHeaders = new Headers({ location: 'https://sso.test/login?auth_request_id=abc' })
    fetchMock.mockResolvedValueOnce(new Response('', { status: 302, headers: upstreamHeaders }))

    const response = await proxyToSsoBackend(proxyRequest(), new URL('https://sso.test/authorize'))
    const [, init] = fetchMock.mock.calls[0] ?? []

    expect(init).toMatchObject({ redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers?.location).toBe('https://sso.test/login?auth_request_id=abc')
  })
})

function proxyRequest(): IncomingMessage {
  return {
    method: 'GET',
    headers: {
      cookie: '__Host-sso_session=session-1',
      'x-request-id': 'req-proxy-redirect',
    },
  } as unknown as IncomingMessage
}
