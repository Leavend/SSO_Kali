import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import type { HeaderValue } from './response.js'

/**
 * Hop-by-hop + body-framing headers that MUST NOT be forwarded downstream.
 *
 * `transfer-encoding` and `content-length` describe the wire framing of the
 * upstream response and must be re-derived for the downstream socket.
 * `connection` controls the upstream socket lifetime and is meaningless to
 * clients of the BFF.
 *
 * `content-encoding` must also be stripped because Node `fetch()` (undici)
 * automatically decompresses the response body when `.arrayBuffer()` is
 * called. The body this BFF forwards to the browser is therefore already
 * plain text/JSON — forwarding the upstream `Content-Encoding: gzip` would
 * cause browsers to attempt a second gunzip on the plain body, producing
 * `ERR_CONTENT_DECODING_FAILED` (see audit ISS-U1, 2026-06-03).
 */
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'connection',
])

/**
 * Hop-by-hop request headers excluded when forwarding the inbound request
 * to the upstream backend.
 *
 * `host` is rewritten by the runtime when the request leaves this process,
 * `connection` controls the inbound socket only, and `content-length` is
 * re-derived by `fetch` once it has streamed the request body.
 */
const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length'])
const REQUEST_ID_HEADER = 'x-request-id'
const MAX_REQUEST_ID_LENGTH = 128

/**
 * Build the upstream `Headers` object for a proxied request.
 *
 * Strips hop-by-hop headers but otherwise preserves every value the
 * client sent (multi-valued headers included).
 */
export function buildProxyRequestHeaders(
  headers: IncomingHttpHeaders,
  requestId = resolveBffRequestId(headers),
): Headers {
  const forwarded = new Headers()

  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_REQUEST_HEADERS.has(name)) continue
    if (Array.isArray(value)) {
      for (const item of value) forwarded.append(name, item)
    } else if (typeof value === 'string') {
      forwarded.set(name, value)
    }
  }

  forwarded.set('X-Request-Id', requestId)

  return forwarded
}

export function resolveBffRequestId(headers: IncomingHttpHeaders): string {
  const requestId = normalizeRequestId(headerValue(headers, REQUEST_ID_HEADER)) ?? randomUUID()
  headers[REQUEST_ID_HEADER] = requestId
  return requestId
}

/**
 * Translate an upstream `fetch` `Headers` instance into the BFF's
 * downstream header dictionary, preserving every `Set-Cookie` entry.
 *
 * Node's `Headers#forEach` reports `Set-Cookie` exactly once with all
 * values joined by `, `, which makes naive iteration drop every cookie
 * after the first comma-split. This function uses `getSetCookie()`
 * (Node 19.7+) to recover the original list verbatim, so the SSO session
 * cookie, framework session cookie, and XSRF-TOKEN cookie all reach the
 * browser intact after login.
 */
export function buildProxyResponseHeaders(headers: Headers): Record<string, HeaderValue> {
  const forwarded: Record<string, HeaderValue> = {}
  const setCookies = readSetCookies(headers)

  if (setCookies.length > 0) forwarded['set-cookie'] = setCookies

  headers.forEach((value, name) => {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(name)) return
    if (name === 'set-cookie') return
    forwarded[name] = value
  })

  return forwarded
}

function readSetCookies(headers: Headers): readonly string[] {
  const native = (headers as Headers & { getSetCookie?: () => readonly string[] }).getSetCookie
  if (typeof native === 'function') return native.call(headers)

  const raw = headers.get('set-cookie')
  return raw ? splitSetCookie(raw) : []
}

function headerValue(headers: IncomingHttpHeaders, header: string): string | null {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== header) continue
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  }

  return null
}

function normalizeRequestId(value: string | null): string | null {
  const normalized = value?.trim()
  if (!normalized) return null
  return normalized.slice(0, MAX_REQUEST_ID_LENGTH)
}

/**
 * Fallback splitter for runtimes that lack `Headers#getSetCookie`. The
 * regex looks ahead for the next `key=` pair so commas inside cookie
 * attributes (e.g. the `Expires=...` weekday separator) do not split a
 * single cookie line in two.
 */
function splitSetCookie(value: string): readonly string[] {
  return value.split(/,(?=\s*[^;=]+=[^;]*)/u).map((cookie) => cookie.trim())
}
