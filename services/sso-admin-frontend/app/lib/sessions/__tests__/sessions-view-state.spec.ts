import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { resolveSessionsViewState } from '../sessions-view-state'
import type { AdminSession } from '@/types/sessions.types'

const session = (over: Partial<AdminSession> = {}): AdminSession => ({
  session_id: 'sess_handle_1',
  client_id: 'portal',
  subject_id: '01HZX9SUBJECTULID00000000AB',
  email: 'user@example.test',
  display_name: 'Test User',
  scope: 'openid profile',
  ip_address: '203.0.113.45',
  user_agent: 'Mozilla/5.0',
  created_at: '2026-06-01T00:00:00Z',
  last_activity_at: '2026-06-02T00:00:00Z',
  expires_at: '2026-07-01T00:00:00Z',
  ...over,
})

describe('resolveSessionsViewState', () => {
  it('is loading when nothing has resolved yet', () => {
    expect(resolveSessionsViewState({ pending: true, error: null, sessions: null })).toBe('loading')
  })

  it('maps a 401 (no prior list) to unauthenticated', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(401, 'x'), sessions: null }),
    ).toBe('unauthenticated')
  })

  it('maps a 403 (no prior list) to forbidden', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(403, 'x'), sessions: null }),
    ).toBe('forbidden')
  })

  it('maps any other error (no prior list) to error', () => {
    expect(
      resolveSessionsViewState({ pending: false, error: new ApiError(500, 'x'), sessions: null }),
    ).toBe('error')
  })

  it('is empty when there are zero active sessions', () => {
    expect(resolveSessionsViewState({ pending: false, error: null, sessions: [] })).toBe('empty')
  })

  it('is ready when sessions exist', () => {
    expect(resolveSessionsViewState({ pending: false, error: null, sessions: [session()] })).toBe(
      'ready',
    )
  })

  it('keeps a good list on screen when a background refresh errors (ready, not error)', () => {
    expect(
      resolveSessionsViewState({
        pending: false,
        error: new ApiError(500, 'x'),
        sessions: [session()],
      }),
    ).toBe('ready')
  })
})
