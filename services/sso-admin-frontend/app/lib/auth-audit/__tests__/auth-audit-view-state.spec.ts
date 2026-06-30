import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveAuthAuditViewState,
  resolveOutcomeTone,
} from '@/lib/auth-audit/auth-audit-view-state'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

const EVENT: AuthAuditEvent = {
  event_id: '01J0AUTH',
  event_type: 'user.login',
  outcome: 'succeeded',
  subject: { subject_id: '01HSUBJECT', email: 'user@example.gov' },
  client_id: 'portal',
  session_id: 'sess_abc',
  request: { ip_address: '203.0.113.4', user_agent: 'UA', request_id: 'req_1' },
  error_code: null,
  context: {},
  occurred_at: '2026-06-28T14:32:15+00:00',
}

describe('resolveAuthAuditViewState', () => {
  it('is loading while pending with no events and no error', () => {
    expect(resolveAuthAuditViewState({ pending: true, error: null, events: null })).toBe('loading')
  })

  it('is empty when the backend returns zero events', () => {
    expect(resolveAuthAuditViewState({ pending: false, error: null, events: [] })).toBe('empty')
  })

  it('is ready when events are present', () => {
    expect(resolveAuthAuditViewState({ pending: false, error: null, events: [EVENT] })).toBe('ready')
  })

  it('maps 401/403 with no events to unauthenticated/forbidden, else error', () => {
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(401, 'x'), events: null }),
    ).toBe('unauthenticated')
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(403, 'x'), events: null }),
    ).toBe('forbidden')
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(500, 'x'), events: null }),
    ).toBe('error')
  })

  it('reads a plain hydration-shaped error (statusCode) when ApiError did not survive SSR', () => {
    expect(
      resolveAuthAuditViewState({ pending: false, error: { statusCode: 403 }, events: null }),
    ).toBe('forbidden')
  })

  it('keeps showing events (ready) when a background error arrives but events are still held', () => {
    expect(
      resolveAuthAuditViewState({ pending: false, error: new ApiError(500, 'x'), events: [EVENT] }),
    ).toBe('ready')
  })
})

describe('resolveOutcomeTone', () => {
  it('succeeded -> success, failed -> danger, started -> info, unknown -> neutral', () => {
    expect(resolveOutcomeTone('succeeded')).toBe('success')
    expect(resolveOutcomeTone('failed')).toBe('danger')
    expect(resolveOutcomeTone('started')).toBe('info')
    expect(resolveOutcomeTone('whatever')).toBe('neutral')
  })
})
