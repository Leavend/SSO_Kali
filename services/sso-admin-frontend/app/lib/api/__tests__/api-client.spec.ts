import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient, getLastRequestId } from '../api-client'

type RawInit = { status?: number; headers?: Record<string, string> }

function raw(body: string, init: RawInit = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json', ...init.headers })
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    _data: new Blob([body], { type: headers.get('Content-Type') ?? '' }),
  }
}

function stubFetch(response: unknown) {
  const rawMock = vi.fn<() => Promise<unknown>>().mockResolvedValue(response)
  vi.stubGlobal('$fetch', Object.assign(vi.fn(), { raw: rawMock }))
  return rawMock
}

describe('apiClient request evidence (Nuxt baseFetch)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { mockApi: 'false' } }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('lang')
  })

  it('sends a generated X-Request-Id when caller does not provide one', async () => {
    const rawMock = stubFetch(raw(JSON.stringify({ ok: true })))
    await apiClient.get('/api/admin/me')
    const headers = rawMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('X-Request-Id')).toMatch(/^admin-[\w-]+$/)
    expect(rawMock.mock.calls[0]?.[1]?.credentials).toBe('include')
  })

  it('preserves a caller supplied X-Request-Id', async () => {
    const rawMock = stubFetch(raw(JSON.stringify({ ok: true })))
    await apiClient.get('/api/admin/me', { headers: { 'X-Request-Id': 'req-custom-1' } })
    const headers = rawMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('X-Request-Id')).toBe('req-custom-1')
  })

  it('propagates Accept-Language from the active document locale', async () => {
    document.documentElement.setAttribute('lang', 'en')
    const rawMock = stubFetch(raw(JSON.stringify({ ok: true })))
    await apiClient.get('/api/admin/me')
    const headers = rawMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Accept-Language')).toBe('en')
  })

  it('records the response X-Request-Id for success states', async () => {
    stubFetch(raw(JSON.stringify({ ok: true }), { headers: { 'X-Request-Id': 'req-response-1' } }))
    await apiClient.get('/api/admin/me')
    expect(getLastRequestId()).toBe('req-response-1')
  })

  it('returns undefined for 204 responses', async () => {
    stubFetch({ ok: true, status: 204, headers: new Headers(), _data: new Blob([]) })
    await expect(apiClient.delete('/api/admin/clients/abc')).resolves.toBeUndefined()
  })

  it('rejects successful non-JSON responses as invalid upstream responses', async () => {
    stubFetch(
      raw('<!doctype html><title>Admin</title>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Request-Id': 'req-html-200' },
      }),
    )
    await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_upstream_response',
      requestId: 'req-html-200',
    } satisfies Partial<ApiError>)
  })

  it('rejects malformed JSON responses as invalid upstream responses', async () => {
    stubFetch(raw('{invalid', { headers: { 'X-Request-Id': 'req-json-invalid' } }))
    await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_upstream_response',
      requestId: 'req-json-invalid',
    } satisfies Partial<ApiError>)
  })

  it('attaches response X-Request-Id to ApiError without copying raw backend trace', async () => {
    stubFetch(
      raw(JSON.stringify({ error: 'server_error', message: 'SQLSTATE leaked backend trace' }), {
        status: 500,
        headers: { 'X-Request-Id': 'req-error-1' },
      }),
    )
    await expect(apiClient.get('/api/admin/dashboard/summary')).rejects.toMatchObject({
      status: 500,
      code: 'server_error',
      requestId: 'req-error-1',
    } satisfies Partial<ApiError>)
  })

  it('reads a blob body and filename from Content-Disposition for downloads', async () => {
    stubFetch(
      raw('action,outcome\nadmin.user.lock,succeeded\n', {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="audit-export.csv"',
          'X-Request-Id': 'req-export-1',
        },
      }),
    )
    const result = await apiClient.getBlob('/api/admin/audit/export?format=csv')
    expect(result.blob.type).toBe('text/csv')
    expect(await result.blob.text()).toBe('action,outcome\nadmin.user.lock,succeeded\n')
    expect(result.filename).toBe('audit-export.csv')
    expect(getLastRequestId()).toBe('req-export-1')
  })

  it('throws ApiError for failed blob downloads without leaking raw backend copy', async () => {
    stubFetch(
      raw(JSON.stringify({ error: 'fresh_auth_required', message: 'raw ACR provider trace' }), {
        status: 428,
        headers: { 'X-Request-Id': 'req-export-428' },
      }),
    )
    await expect(apiClient.getBlob('/api/admin/audit/export?format=csv')).rejects.toMatchObject({
      status: 428,
      code: 'fresh_auth_required',
      requestId: 'req-export-428',
    } satisfies Partial<ApiError>)
  })

  it('logs a decode-context diagnostic when the body fails to decode (ISS-U3)', async () => {
    const decodeBlob = {
      type: 'application/json',
      text: async () => {
        throw new TypeError('Failed to decode body: decoding error')
      },
    }
    stubFetch({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/json',
        'X-Request-Id': 'req-decode-err',
      }),
      _data: decodeBlob,
    })
    await expect(apiClient.get('/api/admin/me')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_upstream_response',
    } satisfies Partial<ApiError>)
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('content-encoding'),
      expect.any(Error),
    )
  })
})
