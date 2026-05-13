import { describe, expect, it } from 'vitest'
import {
  hasUnknownScopes,
  resolveScopeLabel,
  resolveScopeList,
} from '../scope-labels'

describe('resolveScopeLabel', () => {
  it('returns Indonesian label for known openid scope', () => {
    const descriptor = resolveScopeLabel('openid')
    expect(descriptor.name).toBe('openid')
    expect(descriptor.label).toBe('Identitas Dasar')
    expect(descriptor.level).toBe('standard')
  })

  it('flags offline_access as sensitive', () => {
    const descriptor = resolveScopeLabel('offline_access')
    expect(descriptor.level).toBe('sensitive')
    expect(descriptor.description).toMatch(/refresh|offline/i)
  })

  it('returns unknown descriptor for unrecognized scope', () => {
    const descriptor = resolveScopeLabel('admin:accounting')
    expect(descriptor.level).toBe('unknown')
    expect(descriptor.name).toBe('admin:accounting')
    expect(descriptor.description).toMatch(/belum dikenali/i)
  })

  it('trims whitespace around scope names', () => {
    const descriptor = resolveScopeLabel('  profile  ')
    expect(descriptor.name).toBe('profile')
    expect(descriptor.level).toBe('standard')
  })

  it('handles empty string as unknown without crash', () => {
    const descriptor = resolveScopeLabel('')
    expect(descriptor.level).toBe('unknown')
  })
})

describe('resolveScopeList', () => {
  it('splits space-separated scope string', () => {
    const list = resolveScopeList('openid profile email')
    expect(list).toHaveLength(3)
    expect(list.map((s) => s.name)).toEqual(['openid', 'profile', 'email'])
  })

  it('de-duplicates repeated scopes while preserving order', () => {
    const list = resolveScopeList('openid profile openid email')
    expect(list.map((s) => s.name)).toEqual(['openid', 'profile', 'email'])
  })

  it('ignores empty tokens from multiple spaces', () => {
    const list = resolveScopeList('  openid   profile  ')
    expect(list).toHaveLength(2)
  })

  it('accepts array input', () => {
    const list = resolveScopeList(['openid', 'email'])
    expect(list.map((s) => s.name)).toEqual(['openid', 'email'])
  })

  it('returns empty array for empty input', () => {
    expect(resolveScopeList('')).toEqual([])
    expect(resolveScopeList([])).toEqual([])
  })
})

describe('hasUnknownScopes', () => {
  it('returns false when all scopes are recognized', () => {
    const list = resolveScopeList('openid profile email')
    expect(hasUnknownScopes(list)).toBe(false)
  })

  it('returns true when any scope is unknown', () => {
    const list = resolveScopeList('openid evil:scope')
    expect(hasUnknownScopes(list)).toBe(true)
  })

  it('returns false for empty list', () => {
    expect(hasUnknownScopes([])).toBe(false)
  })
})
