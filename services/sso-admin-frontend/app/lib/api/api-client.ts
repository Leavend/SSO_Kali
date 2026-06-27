import { handleMockRequest } from './mock-api-client'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type RawFetchResponse = {
  readonly ok: boolean
  readonly status: number
  readonly headers: Headers
  readonly _data?: unknown
}

let lastRequestId: string | null = null

export function isMockEnabled(): boolean {
  if (import.meta.server) return false
  if (typeof window === 'undefined') return false
  // Guard: useRuntimeConfig() requires a Nuxt app instance. In unit-test
  // environments (plain vitest, no Nuxt context) it throws "instance
  // unavailable"; treat that as mock disabled (safe default).
  let mockApi: string
  try {
    mockApi = useRuntimeConfig().public.mockApi
  } catch {
    return false
  }
  return (
    mockApi === 'true' ||
    window.location.search.includes('mock=true') ||
    localStorage.getItem('mock_api') === 'true'
  )
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly payload: unknown = null,
    readonly requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getLastRequestId(): string | null {
  return lastRequestId
}

export type RequestOptions = {
  readonly method?: HttpMethod
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

export type BlobResponse = {
  readonly blob: Blob
  readonly filename: string | null
}

export type ApiResponseWithRequestId<T> = {
  readonly data: T
  readonly requestId: string | null
}

export type ApiClient = {
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
  getWithRequestId<T>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponseWithRequestId<T>>
  getBlob(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<BlobResponse>
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
}

// baseFetch forwards the encrypted session cookie during SSR (useRequestFetch
// binds the incoming request context) and uses the global $fetch on the client.
// useRequestFetch() is typed as H3Event$Fetch | $Fetch — the H3Event$Fetch
// union branch is a TypeScript artefact; at runtime both expose .raw() and are
// $fetch-compatible, so the cast is safe.
function baseFetch(): typeof $fetch {
  return import.meta.server ? (useRequestFetch() as unknown as typeof $fetch) : $fetch
}

function buildHeaders(custom: Readonly<Record<string, string>> | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  })

  const language = readDocumentLanguage()
  if (language) headers.set('Accept-Language', language)

  if (custom) {
    for (const [key, value] of Object.entries(custom)) headers.set(key, value)
  }

  if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', generateRequestId())

  return headers
}

function readDocumentLanguage(): string | null {
  if (typeof document === 'undefined') return null
  const language = document.documentElement.getAttribute('lang')
  return language && language.length > 0 ? language : null
}

async function sendRequest(path: string, options: RequestOptions = {}): Promise<RawFetchResponse> {
  const method = options.method ?? 'GET'
  const headers = buildHeaders(options.headers)
  let body: string | undefined

  if (options.body !== undefined && options.body !== null) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = (await baseFetch().raw(path, {
    method,
    headers,
    body,
    credentials: 'include',
    responseType: 'blob',
    ignoreResponseError: true,
  })) as unknown as RawFetchResponse

  lastRequestId = response.headers.get('X-Request-Id') ?? headers.get('X-Request-Id')

  if (!response.ok) throw await apiErrorFromResponse(response)

  return response
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (isMockEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const res = handleMockRequest(options.method ?? 'GET', path, options.body)
    if (res.status >= 400) {
      throw new ApiError(
        res.status,
        res.data?.message || 'Mock Error',
        null,
        res.data,
        'mock-req-id',
      )
    }
    return res.data as T
  }
  const response = await sendRequest(path, options)
  if (response.status === 204) return undefined as T

  return (await jsonPayloadFromSuccess(response)) as T
}

async function requestWithRequestId<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponseWithRequestId<T>> {
  if (isMockEnabled()) {
    return { data: await request<T>(path, options), requestId: getLastRequestId() ?? 'mock-req-id' }
  }

  const response = await sendRequest(path, options)
  const requestId = response.headers.get('X-Request-Id') ?? getLastRequestId()

  return {
    data:
      response.status === 204 ? (undefined as T) : ((await jsonPayloadFromSuccess(response)) as T),
    requestId,
  }
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<BlobResponse> {
  if (isMockEnabled()) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const res = handleMockRequest(options.method ?? 'GET', path, options.body)
    if (res.status >= 400) {
      throw new ApiError(
        res.status,
        res.data?.message || 'Mock Error',
        null,
        res.data,
        'mock-req-id',
      )
    }
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    return { blob: new Blob([text], { type: 'text/csv' }), filename: 'export.csv' }
  }
  const response = await sendRequest(path, options)

  return {
    blob: blobBody(response),
    filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')),
  }
}

function blobBody(response: RawFetchResponse): Blob {
  return response._data as Blob
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null

  const utf8Match = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))

  const asciiMatch = /filename="?([^";]+)"?/i.exec(header)
  return asciiMatch?.[1]?.trim() ?? null
}

async function apiErrorFromResponse(response: RawFetchResponse): Promise<ApiError> {
  const payload = await responsePayload(response)
  const message = safeErrorMessage(payload) ?? `Request failed with status ${response.status}`
  const code = safeErrorCode(payload)
  const requestId = response.headers.get('X-Request-Id') ?? lastRequestId

  return new ApiError(response.status, message, code, payload, requestId)
}

async function jsonPayloadFromSuccess(response: RawFetchResponse): Promise<unknown> {
  if (!isJsonResponse(response)) throw invalidUpstreamResponse(response)

  let text: string
  try {
    text = await blobBody(response).text()
  } catch (error) {
    // A decode-flavoured failure here is almost always a stale Content-Encoding
    // header forwarded by the BFF (the body is already decompressed). Log for
    // operator debugging without surfacing raw details to the UI (ISS-U1/U2).
    if (isDecodeError(error)) {
      console.error(
        '[api-client] body decode failed — check that the BFF strips content-encoding before forwarding.',
        error,
      )
    }
    throw invalidUpstreamResponse(response)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw invalidUpstreamResponse(response)
  }
}

function isDecodeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('decod') || msg.includes('content')
}

function isJsonResponse(response: RawFetchResponse): boolean {
  const contentType = response.headers.get('Content-Type')
  if (!contentType) return false

  const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  return mimeType === 'application/json' || mimeType?.endsWith('+json') === true
}

function invalidUpstreamResponse(response: RawFetchResponse): ApiError {
  return new ApiError(
    502,
    'Admin API returned a successful response that was not valid JSON.',
    'invalid_upstream_response',
    null,
    response.headers.get('X-Request-Id') ?? lastRequestId,
  )
}

async function responsePayload(response: RawFetchResponse): Promise<unknown> {
  const data = response._data
  if (data === undefined || data === null) return null
  try {
    return JSON.parse(await (data as Blob).text())
  } catch {
    return null
  }
}

function safeErrorMessage(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null
}

function safeErrorCode(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `admin-${crypto.randomUUID()}`
  }
  return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export const apiClient: ApiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),
  getWithRequestId: <T>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponseWithRequestId<T>> =>
    requestWithRequestId<T>(path, { ...options, method: 'GET' }),
  getBlob: (
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ): Promise<BlobResponse> => requestBlob(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
