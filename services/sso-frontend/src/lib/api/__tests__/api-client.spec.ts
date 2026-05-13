import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api-client'
import { ApiError } from '../api-error'

type FetchArgs = Parameters<typeof fetch>

describe('apiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(document, 'cookie', {
      value: 'XSRF-TOKEN=' + encodeURIComponent('token-abc'),
      configurable: true,
      writable: true,
    })
    document.documentElement.setAttribute('lang', 'id')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    document.documentElement.removeAttribute('lang')
  })

  function okResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('GET attaches baseline headers and credentials include', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true }))

    const data = await apiClient.get<{ ok: boolean }>('/api/auth/session')
    const [url, init] = fetchMock.mock.calls[0] as FetchArgs
    const headers = new Headers(init?.headers)

    expect(url).toBe('/api/auth/session')
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('include')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('X-Request-ID')).toBeTruthy()
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(data).toEqual({ ok: true })
  })

  it('propagates Accept-Language from document.documentElement.lang', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true }))

    await apiClient.get('/api/profile')
    const [, init] = fetchMock.mock.calls[0] as FetchArgs
    const headers = new Headers(init?.headers)

    expect(headers.get('Accept-Language')).toBe('id')
  })

  it('mutating methods attach XSRF header and JSON body', async () => {
    fetchMock.mockResolvedValue(okResponse({ authenticated: true }))

    await apiClient.post('/api/auth/login', { identifier: 'u', password: 'p' })

    const [, init] = fetchMock.mock.calls[0] as FetchArgs
    const headers = new Headers(init?.headers)

    expect(init?.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-XSRF-TOKEN')).toBe('token-abc')
    expect(init?.body).toBe(JSON.stringify({ identifier: 'u', password: 'p' }))
  })

  it('GET requests do not attach XSRF token', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true }))

    await apiClient.get('/api/auth/session')
    const [, init] = fetchMock.mock.calls[0] as FetchArgs
    const headers = new Headers(init?.headers)

    expect(headers.get('X-XSRF-TOKEN')).toBeNull()
  })

  it('throws ApiError on non-2xx responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Validation failed',
          errors: { identifier: ['required'] },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(apiClient.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const data = await apiClient.delete('/api/profile/sessions/abc')
    expect(data).toBeUndefined()
  })

  it('respects custom headers while preserving defaults', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true }))

    await apiClient.get('/api/profile', { headers: { 'X-Tenant': 'acme' } })
    const [, init] = fetchMock.mock.calls[0] as FetchArgs
    const headers = new Headers(init?.headers)

    expect(headers.get('X-Tenant')).toBe('acme')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('X-Request-ID')).toBeTruthy()
  })

  it('uses VITE_SSO_API_URL when set and strips trailing slash', async () => {
    vi.stubEnv('VITE_SSO_API_URL', 'https://api.example.com/')
    fetchMock.mockResolvedValue(okResponse({ ok: true }))

    await apiClient.get('/api/profile')
    const [url] = fetchMock.mock.calls[0] as FetchArgs

    expect(url).toBe('https://api.example.com/api/profile')
  })

  it('maps caller-triggered abort to ApiError.kind="aborted"', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('aborted', 'AbortError'))
            return
          }
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )

    // Abort setelah microtask supaya fetch mock sempat register listener.
    const pending = apiClient.get('/api/profile', { signal: controller.signal, timeoutMs: 0 })
    await Promise.resolve()
    controller.abort()

    await expect(pending).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'aborted',
      status: 0,
    })
  })

  it('maps timeout abort to ApiError.kind="timeout"', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('timeout', 'TimeoutError')),
          )
        }),
    )

    const pending = apiClient.get('/api/profile', { timeoutMs: 100 })
    vi.advanceTimersByTime(150)

    await expect(pending).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'timeout',
    })
  })

  it('maps fetch network failure to ApiError.kind="network"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(apiClient.get('/api/profile', { timeoutMs: 0 })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'network',
      status: 0,
      code: 'network_error',
    })
  })
})
