import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  resolveIpAccessViewState,
  resolveModeTone,
} from '@/lib/ip-access/ip-access-view-state'
import type { IpAccessRule } from '@/types/ip-access.types'

const RULE: IpAccessRule = {
  id: 1,
  cidr: '203.0.113.0/24',
  mode: 'block',
  reason: 'Maintenance window',
  expires_at: null,
  actor_subject_id: 'sub-admin',
  created_at: '2026-06-20T10:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
}

describe('resolveIpAccessViewState', () => {
  it('is loading when no rules and no error yet', () => {
    expect(resolveIpAccessViewState({ pending: true, error: null, rules: null })).toBe('loading')
  })
  it('maps 401 → unauthenticated, 403 → forbidden, other → error (only when no rules)', () => {
    const mk = (status: number) =>
      resolveIpAccessViewState({
        pending: false,
        error: new ApiError(status, 'x'),
        rules: null,
      })
    expect(mk(401)).toBe('unauthenticated')
    expect(mk(403)).toBe('forbidden')
    expect(mk(500)).toBe('error')
  })
  it('is empty for a zero-length list and ready when rules exist', () => {
    expect(resolveIpAccessViewState({ pending: false, error: null, rules: [] })).toBe('empty')
    expect(resolveIpAccessViewState({ pending: false, error: null, rules: [RULE] })).toBe('ready')
  })
  it('stays ready (stale) when an error arrives but cached rules exist', () => {
    expect(
      resolveIpAccessViewState({ pending: false, error: new ApiError(500, 'x'), rules: [RULE] }),
    ).toBe('ready')
  })
})

describe('resolveModeTone', () => {
  it('allow → success, block → warning (Swiss: danger is NOT a status colour)', () => {
    expect(resolveModeTone('allow')).toBe('success')
    expect(resolveModeTone('block')).toBe('warning')
  })
})
