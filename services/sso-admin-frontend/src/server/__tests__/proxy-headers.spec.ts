import { describe, expect, it } from 'vitest'
import { buildProxyRequestHeaders, buildProxyResponseHeaders } from '../proxy-headers.js'

describe('buildProxyResponseHeaders — hop-by-hop and body-framing headers', () => {
  it('strips content-encoding so browser does not attempt to gunzip already-decompressed body', () => {
    // Node fetch (undici) auto-decompresses the upstream body when .arrayBuffer()
    // is called, so the body forwarded to the browser is plain JSON. The
    // upstream Content-Encoding: gzip header is therefore stale and MUST NOT be
    // forwarded — if it is, browsers reject the plain-JSON body with
    // ERR_CONTENT_DECODING_FAILED (ISS-U1).
    const headers = new Headers()
    headers.set('content-encoding', 'gzip')
    headers.set('content-type', 'application/json')
    headers.set('x-request-id', 'req-upstream-1')

    const forwarded = buildProxyResponseHeaders(headers)

    expect(forwarded).not.toHaveProperty('content-encoding')
    expect(forwarded['content-type']).toBe('application/json')
    expect(forwarded['x-request-id']).toBe('req-upstream-1')
  })

  it('strips content-encoding for brotli and zstd variants too', () => {
    for (const encoding of ['br', 'zstd', 'deflate']) {
      const headers = new Headers()
      headers.set('content-encoding', encoding)
      headers.set('content-type', 'application/json')

      const forwarded = buildProxyResponseHeaders(headers)

      expect(forwarded).not.toHaveProperty('content-encoding')
      expect(forwarded['content-type']).toBe('application/json')
    }
  })

  it('still strips transfer-encoding, content-length, and connection', () => {
    const headers = new Headers()
    headers.set('transfer-encoding', 'chunked')
    headers.set('content-length', '256')
    headers.set('connection', 'keep-alive')
    headers.set('content-type', 'application/json')

    const forwarded = buildProxyResponseHeaders(headers)

    expect(forwarded).not.toHaveProperty('transfer-encoding')
    expect(forwarded).not.toHaveProperty('content-length')
    expect(forwarded).not.toHaveProperty('connection')
    expect(forwarded['content-type']).toBe('application/json')
  })

  it('forwards set-cookie entries intact alongside content-type', () => {
    const headers = new Headers()
    headers.append('Set-Cookie', '__Host-admin_session=sess1; Path=/; Secure; HttpOnly')
    headers.set('content-type', 'application/json')

    const forwarded = buildProxyResponseHeaders(headers)

    expect(Array.isArray(forwarded['set-cookie'])).toBe(true)
    expect((forwarded['set-cookie'] as string[]).length).toBeGreaterThan(0)
    expect(forwarded['content-type']).toBe('application/json')
  })
})

describe('buildProxyRequestHeaders — hop-by-hop stripping', () => {
  it('drops host, connection, and content-length from outbound upstream request', () => {
    const forwarded = buildProxyRequestHeaders({
      host: 'admin-sso.timeh.my.id',
      connection: 'keep-alive',
      'content-length': '42',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'x-request-id': 'req-1',
    })

    expect(forwarded.get('host')).toBeNull()
    expect(forwarded.get('connection')).toBeNull()
    expect(forwarded.get('content-length')).toBeNull()
    expect(forwarded.get('accept-encoding')).toBe('identity')
    expect(forwarded.get('x-request-id')).toBe('req-1')
  })

  it('forces identity encoding so Caddy cannot return zstd bodies to the BFF', () => {
    const forwarded = buildProxyRequestHeaders({
      'accept-encoding': 'gzip, deflate, br, zstd',
      'x-request-id': 'req-zstd',
    })

    expect(forwarded.get('accept-encoding')).toBe('identity')
  })
})
