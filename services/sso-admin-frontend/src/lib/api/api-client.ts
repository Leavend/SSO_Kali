export type HttpMethod = 'GET' | 'POST'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly payload: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type RequestOptions = {
  readonly method?: HttpMethod
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

export type ApiClient = {
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
}

function buildHeaders(custom: Readonly<Record<string, string>> | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  })

  if (custom) {
    for (const [key, value] of Object.entries(custom)) headers.set(key, value)
  }

  return headers
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

  if (!response.ok) throw await apiErrorFromResponse(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const payload = await responsePayload(response)
  const message = safeErrorMessage(payload) ?? `Request failed with status ${response.status}`
  const code = safeErrorCode(payload)

  return new ApiError(response.status, message, code, payload)
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

export const apiClient: ApiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...options, method: 'POST', body }),
}
