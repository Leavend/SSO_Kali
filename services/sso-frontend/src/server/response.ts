import type { ServerResponse } from 'node:http'

export type HeaderValue = string | readonly string[]

export type AppResponse = {
  readonly status: number
  readonly headers?: Record<string, HeaderValue>
  readonly body?: string | Buffer
}

export function json(status: number, payload: unknown, headers: Record<string, HeaderValue> = {}): AppResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, private, max-age=0',
      ...headers,
    },
    body: JSON.stringify(payload),
  }
}

export function text(status: number, body: string, headers: Record<string, HeaderValue> = {}): AppResponse {
  return {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      ...headers,
    },
    body,
  }
}

export function html(status: number, body: string, headers: Record<string, HeaderValue> = {}): AppResponse {
  return {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...headers,
    },
    body,
  }
}

export function redirect(
  location: string,
  cookies: readonly string[] = [],
  headers: Record<string, HeaderValue> = {},
): AppResponse {
  return {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store, no-cache, private, max-age=0',
      ...(cookies.length > 0 ? { 'set-cookie': cookies } : {}),
      ...headers,
    },
  }
}

export function methodNotAllowed(): AppResponse {
  return json(405, { error: 'method_not_allowed', message: 'Method not allowed.' })
}

export function unauthorized(): AppResponse {
  return json(401, { error: 'no_session', message: 'No active admin session.' })
}

export function send(res: ServerResponse, appResponse: AppResponse): void {
  const headers = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-frame-options': 'DENY',
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
    ...appResponse.headers,
  }

  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value)
  }

  res.statusCode = appResponse.status
  res.end(appResponse.body)
}
