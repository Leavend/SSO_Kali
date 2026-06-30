import { describe, expect, it } from 'vitest'
import { filterSessions, isOwnSession } from '../sessions-list'
import type { AdminSession } from '@/types/sessions.types'

const make = (over: Partial<AdminSession>): AdminSession => ({
  session_id: 'sess_1',
  client_id: 'portal',
  subject_id: 'subj_a',
  email: 'a@example.test',
  display_name: 'Alice Admin',
  ip_address: '203.0.113.10',
  ...over,
})

const sessions: readonly AdminSession[] = [
  make({
    session_id: 'sess_alpha',
    display_name: 'Alice Admin',
    ip_address: '203.0.113.10',
    client_id: 'portal',
  }),
  make({
    session_id: 'sess_bravo',
    display_name: 'Bob Operator',
    ip_address: '198.51.100.7',
    client_id: 'console',
  }),
]

describe('filterSessions', () => {
  it('returns all sessions for an empty/whitespace query', () => {
    expect(filterSessions(sessions, '')).toBe(sessions)
    expect(filterSessions(sessions, '   ')).toBe(sessions)
  })

  it('matches on display name (case-insensitive)', () => {
    expect(filterSessions(sessions, 'alice').map((s) => s.session_id)).toEqual(['sess_alpha'])
  })

  it('matches on ip address', () => {
    expect(filterSessions(sessions, '198.51').map((s) => s.session_id)).toEqual(['sess_bravo'])
  })

  it('matches on session id and client id', () => {
    expect(filterSessions(sessions, 'bravo').map((s) => s.session_id)).toEqual(['sess_bravo'])
    expect(filterSessions(sessions, 'console').map((s) => s.session_id)).toEqual(['sess_bravo'])
  })

  it('matches on email', () => {
    expect(
      filterSessions([make({ session_id: 'x', email: 'find.me@example.test' })], 'find.me'),
    ).toHaveLength(1)
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterSessions(sessions, 'zzz-no-match')).toEqual([])
  })
})

describe('isOwnSession', () => {
  it('is true when the session subject matches the principal', () => {
    expect(isOwnSession(make({ subject_id: 'me' }), 'me')).toBe(true)
  })

  it('is false for a different subject', () => {
    expect(isOwnSession(make({ subject_id: 'other' }), 'me')).toBe(false)
  })

  it('is false when either side is missing', () => {
    expect(isOwnSession(make({ subject_id: null }), 'me')).toBe(false)
    expect(isOwnSession(make({ subject_id: 'me' }), null)).toBe(false)
    expect(isOwnSession(make({ subject_id: 'me' }), undefined)).toBe(false)
  })
})
