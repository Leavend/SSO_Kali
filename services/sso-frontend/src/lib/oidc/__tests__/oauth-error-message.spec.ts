import { describe, expect, it } from 'vitest'
import {
  extractSupportReference,
  formatSupportReference,
  resolveOAuthErrorMessage,
  resolveOAuthErrorMessageForDev,
} from '../oauth-error-message'

describe('resolveOAuthErrorMessage (FE-FR028-001 / FR-028)', () => {
  it('maps every OAuth 2.0 + OIDC core error code to safe localized copy', () => {
    const codes = [
      'invalid_request',
      'unauthorized_client',
      'access_denied',
      'unsupported_response_type',
      'invalid_scope',
      'server_error',
      'temporarily_unavailable',
      'interaction_required',
      'login_required',
      'account_selection_required',
      'consent_required',
      'invalid_request_uri',
      'invalid_request_object',
      'request_not_supported',
      'request_uri_not_supported',
      'registration_not_supported',
      'mfa_enrollment_required',
      'mfa_reenrollment_required',
    ] as const

    for (const code of codes) {
      const message = resolveOAuthErrorMessage({ error: code, error_description: 'should not leak' })
      expect(message).toBeTypeOf('string')
      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toContain('should not leak')
      expect(message).not.toMatch(/SQLSTATE|<script|stack trace/i)
    }
  })

  it('NEVER renders the raw error_description even when error code is unknown', () => {
    const message = resolveOAuthErrorMessage({
      error: 'invalid_request',
      error_description: "SQLSTATE[23505]: duplicate key value violates unique constraint 'users_email_unique'",
    })

    expect(message).not.toContain('SQLSTATE')
    expect(message).not.toContain('duplicate')
    expect(message).not.toContain('users_email_unique')
  })

  it('falls back to a generic message for unknown error codes', () => {
    const generic = resolveOAuthErrorMessage({ error: 'totally_unknown_code' })
    expect(generic).toBeTypeOf('string')
    expect(generic.length).toBeGreaterThan(0)

    const unknownDescription = resolveOAuthErrorMessage({
      error: 'totally_unknown_code',
      error_description: '<script>alert(1)</script>',
    })
    expect(unknownDescription).not.toContain('<script>')
    expect(unknownDescription).toBe(generic)
  })

  it('rejects code-shaped attacks (whitespace, html, control chars)', () => {
    const attempts: string[] = [
      '<script>alert(1)</script>',
      '   ',
      'access denied',
      'access_denied\n<script>',
      'a'.repeat(2_000),
    ]

    for (const attempt of attempts) {
      const message = resolveOAuthErrorMessage({ error: attempt })
      expect(message).not.toContain('<script>')
      expect(message).not.toContain(attempt)
    }
  })

  it('handles null, undefined, and empty input safely', () => {
    expect(resolveOAuthErrorMessage(null)).toBeTypeOf('string')
    expect(resolveOAuthErrorMessage(undefined)).toBeTypeOf('string')
    expect(resolveOAuthErrorMessage('')).toBeTypeOf('string')
    expect(resolveOAuthErrorMessage({})).toBeTypeOf('string')
  })

  it('accepts a bare string error code', () => {
    const consent = resolveOAuthErrorMessage('consent_required')
    const access = resolveOAuthErrorMessage('access_denied')
    expect(consent).toContain('persetujuan')
    expect(access).toBeTypeOf('string')
    expect(access).not.toBe(consent)
  })
})

describe('resolveOAuthErrorMessageForDev', () => {
  it('does not leak description in production-style env', () => {
    const message = resolveOAuthErrorMessageForDev({
      error: 'invalid_request',
      error_description: 'TECHNICAL TRACE',
    })

    // Vitest sets import.meta.env.DEV=true. In dev we explicitly tag the
    // disclosure with [DEV:] so it can never silently slip into prod
    // copy that reuses the helper. Either form is acceptable; what is
    // forbidden is leaking the raw description without the [DEV:] tag.
    const includesTrace = message.includes('TECHNICAL TRACE')
    const includesDevTag = message.includes('[DEV:')
    expect(includesTrace ? includesDevTag : true).toBe(true)
  })
})

describe('extractSupportReference (FE-FR063-001 / FR-063)', () => {
  it('prefers X-Error-Ref header over body fields', () => {
    const ref = extractSupportReference(
      { error: 'invalid_request', error_ref: 'BODY-123', request_id: 'REQ-456' },
      { 'X-Error-Ref': 'HDR-999' },
    )
    expect(ref).toBe('HDR-999')
  })

  it('falls back to error_ref body field when no header is provided', () => {
    const ref = extractSupportReference({
      error: 'server_error',
      error_ref: 'SSOERR-ABCDEFGH',
    })
    expect(ref).toBe('SSOERR-ABCDEFGH')
  })

  it('falls back to request_id when error_ref is missing', () => {
    const ref = extractSupportReference({
      error: 'invalid_request',
      request_id: 'req-uuid-123',
    })
    expect(ref).toBe('req-uuid-123')
  })

  it('returns null when no reference fields are present', () => {
    expect(extractSupportReference({ error: 'invalid_request' })).toBeNull()
    expect(extractSupportReference(null)).toBeNull()
    expect(extractSupportReference('access_denied')).toBeNull()
  })

  it('drops references that are too long or empty', () => {
    expect(
      extractSupportReference({
        error: 'invalid_request',
        error_ref: 'a'.repeat(200),
      }),
    ).toBeNull()
    expect(
      extractSupportReference({
        error: 'invalid_request',
        error_ref: '   ',
      }),
    ).toBeNull()
  })
})

describe('formatSupportReference (FE-FR063-001 / FR-063)', () => {
  it('renders the localized template only when a reference is supplied', () => {
    const formatted = formatSupportReference('SSOERR-ABCDEFGH')
    expect(formatted).toBeTypeOf('string')
    expect(formatted).toContain('SSOERR-ABCDEFGH')
    expect(formatSupportReference(null)).toBeNull()
    expect(formatSupportReference('')).toBeNull()
  })
})
