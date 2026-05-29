export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

let lastRequestId: string | null = null

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

export type ApiClient = {
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
  getBlob(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<BlobResponse>
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
}

function buildHeaders(custom: Readonly<Record<string, string>> | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  })

  if (custom) {
    for (const [key, value] of Object.entries(custom)) headers.set(key, value)
  }

  if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', generateRequestId())

  return headers
}

async function sendRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET'
  const headers = buildHeaders(options.headers)
  let body: BodyInit | undefined

  if (options.body !== undefined && options.body !== null) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(path, {
    method,
    headers,
    body,
    credentials: 'include',
  })

  lastRequestId = response.headers.get('X-Request-Id') ?? headers.get('X-Request-Id')

  if (!response.ok) throw await apiErrorFromResponse(response)

  return response
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await sendRequest(path, options)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<BlobResponse> {
  const response = await sendRequest(path, options)
  const blob = await response.blob()

  return {
    blob,
    filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')),
  }
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null

  const utf8Match = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))
  }

  const asciiMatch = /filename="?([^";]+)"?/i.exec(header)
  return asciiMatch?.[1]?.trim() ?? null
}

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const payload = await responsePayload(response)
  const message = safeErrorMessage(payload) ?? `Request failed with status ${response.status}`
  const code = safeErrorCode(payload)
  const requestId = response.headers.get('X-Request-Id') ?? lastRequestId

  return new ApiError(response.status, message, code, payload, requestId)
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
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
