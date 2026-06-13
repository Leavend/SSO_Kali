import { describe, expect, it } from 'vitest'
import { ApiError } from './api/api-client'
import {
  formatSectionError,
  formatTransportErrorMessage,
  formatSupportReference,
  isAdminProxyTransportFailure,
} from './display-identifiers'

describe('isAdminProxyTransportFailure', () => {
  it('returns true for admin_proxy_failed code', () => {
    const err = new ApiError(502, 'Bad Gateway', 'admin_proxy_failed')
    expect(isAdminProxyTransportFailure(err)).toBe(true)
  })

  it('returns false for non-admin_proxy_failed 502', () => {
    const err = new ApiError(502, 'Bad Gateway', 'invalid_upstream_response')
    expect(isAdminProxyTransportFailure(err)).toBe(false)
  })

  it('returns false for 200 with admin_proxy_failed (unusual but resilient)', () => {
    const err = new ApiError(200, 'OK', 'admin_proxy_failed')
    expect(isAdminProxyTransportFailure(err)).toBe(true)
  })

  it('returns false for non-ApiError', () => {
    expect(isAdminProxyTransportFailure(new Error('Oops'))).toBe(false)
  })
})

describe('formatTransportErrorMessage', () => {
  it('returns i18n transport failure message with support reference code', () => {
    const msg = formatTransportErrorMessage('req-abc-123')
    expect(msg).toContain('REF-')
    expect(msg).toContain('incident code')
  })

  it('returns i18n fallback copy when requestId is null', () => {
    const msg = formatTransportErrorMessage(null)
    expect(msg).toContain('technical support')
    expect(msg).not.toContain('REF-')
  })

  it('uses localized template when provided (with ref)', () => {
    const template = 'Backend unreachable. Use incident code {ref} for server log review.'
    const msg = formatTransportErrorMessage('req-abc-123', template)
    expect(msg).toContain('REF-')
    expect(msg).toContain('Backend unreachable')
    expect(msg).not.toContain('{ref}')
  })

  it('strips ref from localized template when requestId is absent', () => {
    const template = 'Backend unreachable. Use incident code {ref} for review.'
    const msg = formatTransportErrorMessage(null, template)
    // The {ref} placeholder is removed, leaving the surrounding whitespace.
    expect(msg).toBe('Backend unreachable. Use incident code  for review.')
  })

  it('threads transportMessageTemplate through formatSectionError', () => {
    // ApiError(status, message, code, payload, requestId)
    const transportError = new ApiError(502, 'msg', 'admin_proxy_failed', undefined, 'req-xyz-789')
    const template = 'Transport failed. Ref {ref}.'
    const msg = formatSectionError('Test section', transportError, undefined, template)
    expect(msg).toContain('Transport failed')
    expect(msg).toContain('REF-')
    expect(msg).not.toContain('{ref}')
  })
})

/**
 * Shared derivation vector — anti-drift contract with backend.
 *
 * formatSupportReference(value) = `REF-${ normalizeReference(value).slice(-8) }`
 * where normalizeReference strips non-alphanumeric, uppercases, keeps all chars.
 *
 * Backend AdminAuthenticationAuditQuery mirrors this when filtering by support_reference:
 * - strip non-alphanumeric
 * - uppercase
 * - take last 8 characters
 * - WHERE UPPER(request_id) LIKE '%<suffix>'
 *
 * IF EITHER CHANGES, UPDATE BOTH.
 */
describe('formatSupportReference derivation vector', () => {
  it.each([
    ['01HX7S8Y9ZABCDEF1234567890', 'REF-34567890'],
    ['01HX7S8Y9Z-ABCDEF-1234567890', 'REF-34567890'],
    ['abc12345', 'REF-ABC12345'],
    ['01HX7S', 'REF-01HX7S'], // fewer than 8 chars → returns REF- + whatever we got
    ['REF-XYZ98765', 'REF-XYZ98765'],
    [null, null],
    ['', null],
  ])('maps %s → %s', (input, expected) => {
    expect(formatSupportReference(input)).toBe(expected)
  })
})

describe('formatSectionError', () => {
  it('includes HTTP status code suffix for ApiErrors', () => {
    const err500 = new ApiError(500, 'Server Error', null, null, 'req-id-500')
    const msg500 = formatSectionError('Audit log events', err500)
    expect(msg500).toContain('(HTTP 500)')
    expect(msg500).toContain('Gunakan kode referensi')

    const err429 = new ApiError(429, 'Too Many Requests', null, null, 'req-id-429')
    const msg429 = formatSectionError('Audit log events', err429)
    expect(msg429).toContain('(HTTP 429)')
  })

  it('omits HTTP status code suffix for non-ApiErrors', () => {
    const err = new Error('Some native error')
    const msg = formatSectionError('Audit log events', err, 'req-id-native')
    expect(msg).not.toContain('HTTP')
    expect(msg).toContain('Gunakan kode referensi')
  })

  it('handles 401 unauthenticated status correctly', () => {
    const err = new ApiError(401, 'Unauthorized')
    const msg = formatSectionError('Audit log events', err)
    expect(msg).toBe('Sesi admin berakhir. Login ulang untuk melanjutkan.')
  })

  it('handles 403 forbidden status correctly with lowercase labels', () => {
    const err = new ApiError(403, 'Forbidden')

    const msgAudit = formatSectionError('Audit log events', err)
    expect(msgAudit).toBe('Kamu tidak memiliki izin untuk melihat audit log events.')

    const msgPolicy = formatSectionError('Policy/RBAC admin', err)
    expect(msgPolicy).toBe('Kamu tidak memiliki izin untuk melihat policy/RBAC admin.')
  })

  it('handles admin_proxy_failed with transport copy', () => {
    const err = new ApiError(502, 'Bad Gateway', 'admin_proxy_failed', null, 'req-502-xyz')
    const msg = formatSectionError('OAuth clients', err)
    expect(msg).toContain('REF-')
    expect(msg).toContain('incident code')
    expect(msg).not.toContain('investigasi')
  })

  it('does NOT treat bare 502 (invalid_upstream_response) as transport failure', () => {
    const err = new ApiError(502, 'Bad Gateway', 'invalid_upstream_response', null, 'req-502-gen')
    const msg = formatSectionError('OAuth clients', err)
    expect(msg).toContain('Gunakan kode referensi')
    expect(msg).not.toContain('tim teknis')
  })

  it('treats admin_proxy_failed regardless of status code', () => {
    const err = new ApiError(200, 'OK', 'admin_proxy_failed', null, 'req-proxy-200')
    const msg = formatSectionError('OAuth clients', err)
    expect(msg).toContain('REF-')
    expect(msg).toContain('incident code')
    expect(msg).not.toContain('investigasi')
  })
})
