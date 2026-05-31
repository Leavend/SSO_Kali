import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient, getLastRequestId } from '../api-client'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = { 'Content-Type': 'application/json', ...init.headers }

  return new Response(JSON.stringify(body), {
    ...init,
    status: init.status ?? 200,
    headers,
  })
}

describe('apiClient request evidence', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('lang')
  })

  it('sends a generated X-Request-Id when caller does not provide one', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.get('/api/admin/me')

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init).toBeDefined()
    const headers = init?.headers as Headers
    expect(headers).toBeInstanceOf(Headers)
    expect(headers.get('X-Request-Id')).toMatch(/^admin-[\w-]+$/)
  })

  it('preserves a caller supplied X-Request-Id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.get('/api/admin/me', { headers: { 'X-Request-Id': 'req-custom-1' } })

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init).toBeDefined()
    const headers = init?.headers as Headers
    expect(headers.get('X-Request-Id')).toBe('req-custom-1')
  })

  it('propagates Accept-Language from the active document locale', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.get('/api/admin/me')

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = init?.headers as Headers
    expect(headers.get('Accept-Language')).toBe('en')
  })

  it('records the response X-Request-Id for success states', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ ok: true }, { headers: { 'X-Request-Id': 'req-response-1' } }),
        ),
    )

    await apiClient.get('/api/admin/me')

    expect(getLastRequestId()).toBe('req-response-1')
  })

  it('rejects successful non-JSON API responses as invalid upstream responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('<!doctype html><title>Admin SPA</title>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Request-Id': 'req-html-200',
          },
        }),
      ),
    )

    await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_upstream_response',
      requestId: 'req-html-200',
    } satisfies Partial<ApiError>)
  })

  it('rejects successful malformed JSON API responses as invalid upstream responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{invalid', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'req-json-invalid',
          },
        }),
      ),
    )

    await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_upstream_response',
      requestId: 'req-json-invalid',
    } satisfies Partial<ApiError>)
  })

  it('attaches response X-Request-Id to ApiError without requiring raw backend copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            { error: 'server_error', message: 'SQLSTATE leaked backend trace' },
            { status: 500, headers: { 'X-Request-Id': 'req-error-1' } },
          ),
        ),
    )

    await expect(apiClient.get('/api/admin/dashboard/summary')).rejects.toMatchObject({
      status: 500,
      code: 'server_error',
      requestId: 'req-error-1',
    } satisfies Partial<ApiError>)
  })

  it('reads a blob body and filename from Content-Disposition for downloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('action,outcome\nadmin.user.lock,succeeded\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="audit-export.csv"',
            'X-Request-Id': 'req-export-1',
          },
        }),
      ),
    )

    const result = await apiClient.getBlob('/api/admin/audit/export?format=csv')

    // Assert blob behaviour, not instance identity: under Node's undici the
    // fetch Blob comes from a different realm than the global Blob, so
    // toBeInstanceOf(Blob) is flaky across environments.
    expect(result.blob.type).toBe('text/csv')
    expect(await result.blob.text()).toBe('action,outcome\nadmin.user.lock,succeeded\n')
    expect(result.filename).toBe('audit-export.csv')
    expect(getLastRequestId()).toBe('req-export-1')
  })

  it('throws ApiError for failed blob downloads without leaking raw backend copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            { error: 'fresh_auth_required', message: 'raw ACR provider trace' },
            { status: 428, headers: { 'X-Request-Id': 'req-export-428' } },
          ),
        ),
    )

    await expect(apiClient.getBlob('/api/admin/audit/export?format=csv')).rejects.toMatchObject({
      status: 428,
      code: 'fresh_auth_required',
      requestId: 'req-export-428',
    } satisfies Partial<ApiError>)
  })
})
