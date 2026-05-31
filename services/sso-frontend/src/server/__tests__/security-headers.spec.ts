import type { ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { html, send } from '../response.js'

type HeaderValue = number | string | readonly string[]

function responseDouble(): ServerResponse & {
  readonly headers: Map<string, HeaderValue>
  readonly end: ReturnType<typeof vi.fn>
} {
  const headers = new Map<string, HeaderValue>()

  return {
    headers,
    statusCode: 0,
    setHeader(name: string, value: HeaderValue): ServerResponse {
      headers.set(name.toLowerCase(), value)
      return this as ServerResponse
    },
    end: vi.fn(),
  } as unknown as ServerResponse & {
    readonly headers: Map<string, HeaderValue>
    readonly end: ReturnType<typeof vi.fn>
  }
}

describe('portal BFF security headers', () => {
  it('sets defense-in-depth headers on HTML responses', () => {
    const response = responseDouble()

    send(response, html(200, '<!doctype html><html lang="id"></html>'))

    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains',
    )
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('same-origin')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  })
})
