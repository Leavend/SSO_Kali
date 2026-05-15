import { describe, expect, it } from 'vitest'
import {
  hasUnknownScopes,
  mergeBackendScopes,
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

  it('exposes labels for the full backend MVP scope catalog', () => {
    for (const scope of ['openid', 'profile', 'email', 'offline_access', 'roles', 'permissions']) {
      const descriptor = resolveScopeLabel(scope)
      expect(descriptor.level).not.toBe('unknown')
      expect(descriptor.label.length).toBeGreaterThan(0)
      expect(descriptor.description.length).toBeGreaterThan(0)
    }
  })

  it('returns a safe generic fallback for unknown scopes', () => {
    const descriptor = resolveScopeLabel('admin:accounting')
    expect(descriptor.level).toBe('unknown')
    expect(descriptor.name).toBe('admin:accounting')
    expect(descriptor.label).not.toContain('admin:accounting')
    expect(descriptor.label).toMatch(/belum terverifikasi/i)
    expect(descriptor.description).toMatch(/belum terdaftar/i)
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

describe('mergeBackendScopes', () => {
  it('overrides description with backend copy while preserving localized label', () => {
    const merged = mergeBackendScopes(
      ['openid'],
      new Map([['openid', 'Backend authoritative description.']]),
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('openid')
    expect(merged[0].label).toBe('Identitas Dasar')
    expect(merged[0].description).toBe('Backend authoritative description.')
    expect(merged[0].level).toBe('standard')
  })

  it('keeps the localized description when the backend omits it', () => {
    const merged = mergeBackendScopes(['email'], new Map())

    expect(merged[0].description).toMatch(/email/i)
    expect(merged[0].label).toBe('Alamat Email')
  })

  it('still surfaces unknown scopes with the safe fallback even when backend skips them', () => {
    const merged = mergeBackendScopes(['openid', 'evil:scope'], new Map([['openid', 'desc']]))

    expect(merged.map((scope) => scope.name)).toEqual(['openid', 'evil:scope'])
    expect(merged[1].level).toBe('unknown')
    expect(merged[1].label).toMatch(/belum terverifikasi/i)
    expect(merged[1].label).not.toContain('evil:scope')
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
