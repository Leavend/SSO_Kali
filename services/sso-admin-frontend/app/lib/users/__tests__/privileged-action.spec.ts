import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { resolvePrivilegedActionFailure } from '../privileged-action'

describe('resolvePrivilegedActionFailure — HTTP status matrix', () => {
  it('4.3 — 401 maps to unauthenticated', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(401, 'unauthorized')).status).toBe(
      'unauthenticated',
    )
  })

  it('4.4 — 419 (session/CSRF expired) maps to unauthenticated', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(419, 'session expired')).status).toBe(
      'unauthenticated',
    )
  })

  it('4.2 — 403 maps to forbidden', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(403, 'forbidden')).status).toBe('forbidden')
  })

  it('4.5 — 429 maps to rate_limited', () => {
    expect(resolvePrivilegedActionFailure(new ApiError(429, 'too many requests')).status).toBe(
      'rate_limited',
    )
  })

  it('4.6 — 422 maps to invalid and lifts field errors from payload.errors', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(422, 'validation failed', 'validation_failed', {
        message: 'The given data was invalid.',
        errors: { email: ['Email already taken.'], nik: ['Invalid NIK.'] },
      }),
    )
    expect(failure.status).toBe('invalid')
    expect(failure.fieldErrors.email).toEqual(['Email already taken.'])
    expect(failure.fieldErrors.nik).toEqual(['Invalid NIK.'])
  })

  it('4.7 — 428 (reauth_required) maps to step_up_required and lifts step_up_url', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(428, 'reauth required', 'reauth_required', {
        error: 'reauth_required',
        step_up_url: '/auth/login?prompt=login&max_age=0&return_to=%2Fusers',
      }),
    )
    expect(failure.status).toBe('step_up_required')
    expect(failure.stepUpUrl).toBe('/auth/login?prompt=login&max_age=0&return_to=%2Fusers')
  })

  it('4.7 — a step_up_required code on a non-428 status still maps to step_up_required', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(403, 'step up', 'step_up_required', { step_up_url: '/auth/login' }),
    )
    expect(failure.status).toBe('step_up_required')
    expect(failure.stepUpUrl).toBe('/auth/login')
  })

  it('4.8 — 5xx maps to error with no leaked field/step-up data', () => {
    const failure = resolvePrivilegedActionFailure(new ApiError(500, 'boom'))
    expect(failure.status).toBe('error')
    expect(failure.fieldErrors).toEqual({})
    expect(failure.stepUpUrl).toBeNull()
  })

  it('4.9 — surfaces requestId (ApiError wins) and auditEventId from payload', () => {
    const failure = resolvePrivilegedActionFailure(
      new ApiError(
        422,
        'invalid',
        'validation_failed',
        { audit_event_id: 'evt_abc123' },
        'req_xyz',
      ),
    )
    expect(failure.requestId).toBe('req_xyz')
    expect(failure.auditEventId).toBe('evt_abc123')
  })

  it('a non-ApiError (thrown string/object) is treated as a generic error, never crashes', () => {
    const failure = resolvePrivilegedActionFailure(new TypeError('network down'))
    expect(failure.status).toBe('error')
    expect(failure.auditEventId).toBeNull()
    expect(failure.fieldErrors).toEqual({})
    expect(failure.stepUpUrl).toBeNull()
  })
})
