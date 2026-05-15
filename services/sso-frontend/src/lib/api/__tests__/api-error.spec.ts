import { describe, expect, it } from 'vitest'
import {
  ApiError,
  isAbortError,
  isApiError,
  isConflict,
  isForbidden,
  isNetworkFailure,
  isNotFound,
  isServerError,
  isTimeout,
  isTooManyRequests,
  isUnauthorized,
  isValidationError,
} from '../api-error'

describe('ApiError constructor & defaults', () => {
  it('defaults to kind "http" and empty violations', () => {
    const error = new ApiError(500, 'Boom')

    expect(error.status).toBe(500)
    expect(error.message).toBe('Boom')
    expect(error.code).toBeNull()
    expect(error.violations).toHaveLength(0)
    expect(error.kind).toBe('http')
    expect(error.name).toBe('ApiError')
  })
})

describe('ApiError.fromResponse', () => {
  it('parses Laravel validation payloads with field messages', async () => {
    const response = new Response(
      JSON.stringify({
        message: 'Validation failed',
        errors: {
          identifier: ['Email wajib diisi.'],
          password: ['Password wajib diisi.'],
        },
      }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    )

    const error = await ApiError.fromResponse(response)

    expect(isValidationError(error)).toBe(true)
    expect(error.violations).toEqual([
      { field: 'identifier', message: 'Email wajib diisi.' },
      { field: 'password', message: 'Password wajib diisi.' },
    ])
    expect(error.message).toBe('Validation failed')
  })

  it('falls back to status-specific Indonesian message when body is empty', async () => {
    const response = new Response('', {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })

    const error = await ApiError.fromResponse(response)

    expect(isUnauthorized(error)).toBe(true)
    expect(error.message).toMatch(/Sesi SSO/i)
  })

  it('handles plain-text responses gracefully (uses fallback, never raw HTML)', async () => {
    const response = new Response('<html>503 Bad Gateway</html>', {
      status: 503,
      headers: { 'content-type': 'text/html' },
    })

    const error = await ApiError.fromResponse(response)

    expect(error.status).toBe(503)
    expect(error.message).toBe('Layanan SSO sedang tidak tersedia. Coba lagi nanti.')
    expect(isServerError(error)).toBe(true)
  })

  it('reads OAuth2 error shape (error + error_description)', async () => {
    const response = new Response(
      JSON.stringify({ error: 'invalid_grant', error_description: 'code expired' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )

    const error = await ApiError.fromResponse(response)

    expect(error.code).toBe('invalid_grant')
    expect(error.message).toBe('code expired')
  })

  it('maps the admin MFA enrollment-required message to a localized copy', async () => {
    const response = new Response(
      JSON.stringify({
        error: 'mfa_enrollment_required',
        error_description:
          'You must enroll a multi-factor authentication method before accessing the admin panel.',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )

    const error = await ApiError.fromResponse(response)

    expect(error.code).toBe('mfa_enrollment_required')
    expect(error.message).toBe(
      'Aktifkan autentikasi multi-faktor (MFA) sebelum mengakses panel admin.',
    )
  })

  it('maps Laravel CSRF failures to user-friendly copy', async () => {
    const response = new Response(JSON.stringify({ message: 'CSRF token mismatch.' }), {
      status: 419,
      headers: { 'content-type': 'application/json' },
    })

    const error = await ApiError.fromResponse(response)

    expect(error.status).toBe(419)
    expect(error.message).toBe('Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.')
  })
})

describe('ApiError factories for transport failures', () => {
  it('fromNetworkError marks kind "network" with status 0', () => {
    const error = ApiError.fromNetworkError(new TypeError('offline'))

    expect(error.status).toBe(0)
    expect(error.kind).toBe('network')
    expect(isNetworkFailure(error)).toBe(true)
    expect(error.code).toBe('network_error')
  })

  it('fromTimeout marks kind "timeout"', () => {
    const error = ApiError.fromTimeout()
    expect(error.kind).toBe('timeout')
    expect(isTimeout(error)).toBe(true)
  })

  it('fromAbort marks kind "aborted"', () => {
    const error = ApiError.fromAbort()
    expect(error.kind).toBe('aborted')
    expect(isAbortError(error)).toBe(true)
  })
})

describe('predicates cover every discrimination case', () => {
  it('identifies ApiError instances', () => {
    expect(isApiError(new ApiError(500, 'x'))).toBe(true)
    expect(isApiError(new Error('other'))).toBe(false)
    expect(isApiError('raw string')).toBe(false)
  })

  it.each([
    [401, isUnauthorized],
    [403, isForbidden],
    [404, isNotFound],
    [409, isConflict],
    [422, isValidationError],
    [429, isTooManyRequests],
  ])('status %d matches its predicate', (status, predicate) => {
    expect(predicate(new ApiError(status, 'x'))).toBe(true)
    expect(predicate(new ApiError(500, 'x'))).toBe(false)
  })

  it('recognises 5xx via isServerError', () => {
    expect(isServerError(new ApiError(500, 'x'))).toBe(true)
    expect(isServerError(new ApiError(503, 'x'))).toBe(true)
    expect(isServerError(new ApiError(499, 'x'))).toBe(false)
  })
})

describe('violationsByField helper', () => {
  it('collapses list to field → message map', () => {
    const error = new ApiError(422, 'Invalid', null, [
      { field: 'identifier', message: 'wajib' },
      { field: 'password', message: 'terlalu pendek' },
    ])

    expect(error.violationsByField()).toEqual({
      identifier: 'wajib',
      password: 'terlalu pendek',
    })
  })
})

describe('isRetryable heuristic', () => {
  it('returns true for 408, 429, 5xx, network, timeout', () => {
    expect(new ApiError(408, 'x').isRetryable()).toBe(true)
    expect(new ApiError(429, 'x').isRetryable()).toBe(true)
    expect(new ApiError(500, 'x').isRetryable()).toBe(true)
    expect(new ApiError(503, 'x').isRetryable()).toBe(true)
    expect(ApiError.fromTimeout().isRetryable()).toBe(true)
    expect(ApiError.fromNetworkError(new Error('net')).isRetryable()).toBe(true)
  })

  it('returns false for 4xx non-retryable and abort', () => {
    expect(new ApiError(400, 'x').isRetryable()).toBe(false)
    expect(new ApiError(401, 'x').isRetryable()).toBe(false)
    expect(new ApiError(403, 'x').isRetryable()).toBe(false)
    expect(new ApiError(404, 'x').isRetryable()).toBe(false)
    expect(new ApiError(422, 'x').isRetryable()).toBe(false)
    expect(ApiError.fromAbort().isRetryable()).toBe(false)
  })
})
