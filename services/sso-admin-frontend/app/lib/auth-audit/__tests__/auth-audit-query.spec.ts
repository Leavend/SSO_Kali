import { describe, expect, it } from 'vitest'
import { buildAuthAuditQuery, DEFAULT_AUTH_AUDIT_LIMIT } from '@/lib/auth-audit/auth-audit-query'

const PATH = '/api/admin/audit/authentication-events'

describe('buildAuthAuditQuery', () => {
  it('returns the bare path when there are no filters', () => {
    expect(buildAuthAuditQuery(PATH, {})).toBe(PATH)
  })

  it('omits blank / null / undefined values', () => {
    expect(
      buildAuthAuditQuery(PATH, { event_type: '', subject_id: undefined, outcome: 'succeeded' }),
    ).toBe(`${PATH}?outcome=succeeded`)
  })

  it('serializes set filters incl. limit and cursor', () => {
    const q = buildAuthAuditQuery(PATH, {
      limit: DEFAULT_AUTH_AUDIT_LIMIT,
      outcome: 'failed',
      from: '2026-06-01',
      cursor: 'abc123',
    })
    expect(q.startsWith(`${PATH}?`)).toBe(true)
    expect(q).toContain('limit=50')
    expect(q).toContain('outcome=failed')
    expect(q).toContain('from=2026-06-01')
    expect(q).toContain('cursor=abc123')
  })

  it('url-encodes values', () => {
    expect(buildAuthAuditQuery(PATH, { event_type: 'user login' })).toContain('event_type=user+login')
  })

  it('exposes the default limit', () => {
    expect(DEFAULT_AUTH_AUDIT_LIMIT).toBe(50)
  })
})
