import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { resolvePolicyStatusTone, resolvePolicyViewState } from '../policy-view-state'
import type { SecurityPolicy } from '@/types/policy.types'

const policy = (over: Partial<SecurityPolicy> = {}): SecurityPolicy => ({
  id: 1,
  category: 'password',
  version: 1,
  status: 'active',
  payload: { min_length: 14 },
  effective_at: '2026-06-01T00:00:00Z',
  activated_at: '2026-06-01T00:00:00Z',
  superseded_at: null,
  actor_subject_id: '01HZX9ADMINULID0000000000',
  reason: 'Baseline',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...over,
})

describe('resolvePolicyViewState', () => {
  it('is loading when nothing has resolved yet', () => {
    expect(resolvePolicyViewState({ pending: true, error: null, policies: null })).toBe('loading')
  })

  it('maps a 401 (no prior list) to unauthenticated', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(401, 'x'), policies: null }),
    ).toBe('unauthenticated')
  })

  it('maps a 403 (no prior list) to forbidden', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(403, 'x'), policies: null }),
    ).toBe('forbidden')
  })

  it('maps any other error (no prior list) to error', () => {
    expect(
      resolvePolicyViewState({ pending: false, error: new ApiError(500, 'x'), policies: null }),
    ).toBe('error')
  })

  it('is empty when the category has zero versions', () => {
    expect(resolvePolicyViewState({ pending: false, error: null, policies: [] })).toBe('empty')
  })

  it('is ready when versions exist', () => {
    expect(resolvePolicyViewState({ pending: false, error: null, policies: [policy()] })).toBe(
      'ready',
    )
  })

  it('keeps a good list on screen when a background refresh errors (ready, not error)', () => {
    expect(
      resolvePolicyViewState({
        pending: false,
        error: new ApiError(500, 'x'),
        policies: [policy()],
      }),
    ).toBe('ready')
  })
})

describe('resolvePolicyStatusTone', () => {
  it('maps each status to a distinct, accessible tone (never colour-alone — paired with a label in the badge)', () => {
    expect(resolvePolicyStatusTone('active')).toBe('success')
    expect(resolvePolicyStatusTone('draft')).toBe('info')
    expect(resolvePolicyStatusTone('rolled_back')).toBe('warning')
    expect(resolvePolicyStatusTone('superseded')).toBe('neutral')
  })

  it('falls back to neutral for an unknown status', () => {
    expect(resolvePolicyStatusTone('something-new')).toBe('neutral')
  })
})
