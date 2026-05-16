import { ApiError } from '@/lib/api/api-error'

export type AdminRequestOptions = {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

export async function adminBffRequest<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: requestHeaders(options.body, options.headers),
    body: requestBody(options.body),
    credentials: 'include',
  })

  if (!response.ok) throw await ApiError.fromResponse(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

export async function adminBffDownload(path: string): Promise<Blob> {
  const response = await fetch(path, {
    method: 'GET',
    headers: requestHeaders(undefined, undefined),
    credentials: 'include',
  })

  if (!response.ok) throw await ApiError.fromResponse(response)
  return response.blob()
}

function requestHeaders(
  body: unknown,
  custom: Readonly<Record<string, string>> | undefined,
): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Request-ID': requestId(),
  })

  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (custom) {
    for (const [key, value] of Object.entries(custom)) headers.set(key, value)
  }

  return headers
}

function requestBody(body: unknown): BodyInit | undefined {
  return body === undefined ? undefined : JSON.stringify(body)
}

function requestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}
