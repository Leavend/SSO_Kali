import { describe, expect, it } from 'vitest'
import {
  POLICY_CATEGORIES,
  describeTransitionImpact,
  findActiveVersion,
  isPolicyCategory,
  parsePolicyPayload,
} from '../policy-helpers'
import type { SecurityPolicy } from '@/types/policy.types'

const policy = (over: Partial<SecurityPolicy>): SecurityPolicy => ({
  id: 1,
  category: 'password',
  version: 1,
  status: 'superseded',
  payload: {},
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...over,
})

describe('POLICY_CATEGORIES / isPolicyCategory', () => {
  it('lists exactly the five backend categories in display order', () => {
    expect(POLICY_CATEGORIES).toEqual(['password', 'mfa', 'session', 'lockout', 'legal_hold'])
  })

  it('narrows a known category and rejects an unknown one', () => {
    expect(isPolicyCategory('session')).toBe(true)
    expect(isPolicyCategory('roles')).toBe(false)
  })
})

describe('parsePolicyPayload', () => {
  it('accepts a JSON object', () => {
    expect(parsePolicyPayload('{"min_length":14}')).toEqual({ ok: true, value: { min_length: 14 } })
  })

  it('rejects malformed JSON without throwing', () => {
    expect(parsePolicyPayload('{not json')).toEqual({ ok: false, error: 'syntax' })
  })

  it('rejects a JSON array (backend wants an object payload)', () => {
    expect(parsePolicyPayload('[1,2,3]')).toEqual({ ok: false, error: 'not_object' })
  })

  it('rejects a JSON scalar', () => {
    expect(parsePolicyPayload('42')).toEqual({ ok: false, error: 'not_object' })
    expect(parsePolicyPayload('null')).toEqual({ ok: false, error: 'not_object' })
  })
})

describe('findActiveVersion', () => {
  it('returns the active version number', () => {
    expect(
      findActiveVersion([policy({ version: 3, status: 'active' }), policy({ version: 2 })]),
    ).toBe(3)
  })

  it('returns null when no version is active', () => {
    expect(findActiveVersion([policy({ version: 1 }), policy({ version: 2 })])).toBeNull()
  })
})

describe('describeTransitionImpact', () => {
  it('flags a transition that replaces a currently-active version', () => {
    expect(describeTransitionImpact(5, 3)).toEqual({
      targetVersion: 5,
      activeVersion: 3,
      replacesActive: true,
    })
  })

  it('flags a transition with no current active version', () => {
    expect(describeTransitionImpact(1, null)).toEqual({
      targetVersion: 1,
      activeVersion: null,
      replacesActive: false,
    })
  })

  it('does not flag replacement when the target is already the active version', () => {
    expect(describeTransitionImpact(3, 3).replacesActive).toBe(false)
  })
})
