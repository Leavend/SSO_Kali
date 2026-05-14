import type { IncomingMessage, ServerResponse } from 'node:http'
import { gzipSync } from 'node:zlib'

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

/** Minimum body size (bytes) to justify gzip overhead. */
const COMPRESS_THRESHOLD = 256

function acceptsGzip(request: IncomingMessage | undefined): boolean {
  if (!request) return false
  const accept = request.headers['accept-encoding']
  return typeof accept === 'string' && accept.includes('gzip')
}

export function send(res: ServerResponse, appResponse: AppResponse, request?: IncomingMessage): void {
  const headers: Record<string, HeaderValue> = {
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

  let body = appResponse.body

  // Compress text responses when client supports gzip and body is large enough
  if (body && body.length > COMPRESS_THRESHOLD && acceptsGzip(request)) {
    const raw = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body
    body = gzipSync(raw, { level: 6 })
    headers['content-encoding'] = 'gzip'
    headers['vary'] = 'Accept-Encoding'
  }

  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value)
  }

  res.statusCode = appResponse.status
  res.end(body)
}

