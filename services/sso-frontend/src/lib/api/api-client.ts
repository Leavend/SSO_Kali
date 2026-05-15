/**
 * Centralized API client untuk backend SSO Laravel.
 *
 * Responsibilities (standart-quality-code §10.1 + design.md §13):
 *   - Attach `X-Request-ID` (UUID v4) untuk korelasi dengan backend log.
 *   - Attach `X-XSRF-TOKEN` (dari cookie `XSRF-TOKEN`) untuk metode mutasi.
 *   - `credentials: 'include'` → cookie sesi same-origin mengalir otomatis.
 *   - Propagasi `Accept-Language` dari `<html lang>` supaya backend menyesuaikan pesan.
 *   - Timeout default 30 detik via AbortController bila caller tidak pass signal.
 *   - Konversi 4xx/5xx ke `ApiError` yang typed.
 *
 * Rules:
 *   - Tidak menyimpan token di `localStorage` (standart §13.1).
 *   - Tidak boleh console.log di prod (standart §13.3).
 *   - Zero `any` (standart §7).
 */

import { ApiError } from './api-error'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestOptions = {
  readonly method?: HttpMethod
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
  /** Override default timeout (ms). Set ke `0` untuk disable. */
  readonly timeoutMs?: number
}

export type ApiClient = {
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T>
  delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T>
}

const MUTATING_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE'])
const DEFAULT_TIMEOUT_MS = 30_000 as const
const XSRF_COOKIE_PATTERN = /(?:^|; )XSRF-TOKEN=([^;]+)/

function baseUrl(): string {
  const raw = import.meta.env.VITE_SSO_API_URL
  if (typeof raw !== 'string' || raw.length === 0) return ''
  return raw.replace(/\/$/u, '')
}

function requestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function readXsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = XSRF_COOKIE_PATTERN.exec(document.cookie)
  const captured = match?.[1]
  return captured ? decodeURIComponent(captured) : null
}

function readDocumentLanguage(): string | null {
  if (typeof document === 'undefined') return null
  const lang = document.documentElement.getAttribute('lang')
  return lang && lang.length > 0 ? lang : null
}

function buildHeaders(
  method: HttpMethod,
  custom: Readonly<Record<string, string>> | undefined,
): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Request-ID': requestId(),
  })

  const language = readDocumentLanguage()
  if (language) headers.set('Accept-Language', language)

  if (MUTATING_METHODS.has(method)) {
    const xsrf = readXsrfToken()
    if (xsrf) headers.set('X-XSRF-TOKEN', xsrf)
  }

  if (custom) {
    for (const [key, value] of Object.entries(custom)) headers.set(key, value)
  }

  return headers
}

function resolveSignal(options: RequestOptions): {
  readonly signal: AbortSignal | undefined
  readonly cleanup: () => void
} {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (timeout <= 0) {
    return { signal: options.signal, cleanup: noop }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeout)

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason)
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), {
        once: true,
      })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers = buildHeaders(method, options.headers)

  let body: BodyInit | undefined
  if (options.body !== undefined && options.body !== null) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const { signal, cleanup } = resolveSignal(options)

  try {
    let response: Response
    try {
      response = await fetch(`${baseUrl()}${path}`, {
        method,
        headers,
        body,
        credentials: 'include',
        signal,
      })
    } catch (error) {
      // Cek saat error terjadi apakah caller signal yang memicu abort.
      const callerAborted = options.signal?.aborted ?? false
      throw mapFetchFailure(error, callerAborted)
    }

    if (!response.ok) {
      throw await ApiError.fromResponse(response)
    }

    if (response.status === 204) return undefined as T

    return (await response.json()) as T
  } finally {
    cleanup()
  }
}

function mapFetchFailure(error: unknown, callerAborted: boolean): ApiError {
  if (error instanceof DOMException) {
    if (error.name === 'TimeoutError') return ApiError.fromTimeout()
    if (error.name === 'AbortError') {
      return callerAborted ? ApiError.fromAbort() : ApiError.fromTimeout()
    }
  }
  return ApiError.fromNetworkError(error)
}

function noop(): void {
  /* no-op */
}

export const apiClient: ApiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> =>
    request<T>(path, { ...(options ?? {}), method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...(options ?? {}), method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...(options ?? {}), method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...(options ?? {}), method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> =>
    request<T>(path, { ...(options ?? {}), method: 'DELETE' }),
}
