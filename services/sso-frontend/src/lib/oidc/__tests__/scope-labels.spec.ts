import { describe, expect, it } from 'vitest'
import {
  hasUntrustedScopes,
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
    expect(descriptor.label).toBe('Cakupan Akses Baru')
    expect(descriptor.statusLabel).toBe('Belum Diverifikasi')
    expect(descriptor.description).toMatch(/Hubungi administrator/i)
  })

  it('separates the sso.portal scope label from its verification status', () => {
    const descriptor = resolveScopeLabel('sso.portal')

    expect(descriptor.name).toBe('sso.portal')
    expect(descriptor.label).toBe('SSO Portal')
    expect(descriptor.level).toBe('unverified')
    expect(descriptor.statusLabel).toBe('Belum Diverifikasi')
    expect(descriptor.description).toBe(
      'Akses ke fitur portal SSO. Hubungi administrator untuk verifikasi sebelum mengaktifkan.',
    )
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

    const descriptor = merged[0]

    expect(descriptor).toBeDefined()
    expect(descriptor?.name).toBe('openid')
    expect(descriptor?.label).toBe('Identitas Dasar')
    expect(descriptor?.description).toBe('Backend authoritative description.')
    expect(descriptor?.level).toBe('standard')
  })

  it('keeps the localized description when the backend omits it', () => {
    const merged = mergeBackendScopes(['email'], new Map())

    const descriptor = merged[0]

    expect(descriptor?.description).toMatch(/email/i)
    expect(descriptor?.label).toBe('Alamat Email')
  })

  it('still surfaces unknown scopes with the safe fallback even when backend skips them', () => {
    const merged = mergeBackendScopes(['openid', 'evil:scope'], new Map([['openid', 'desc']]))

    const unknownScope = merged[1]

    expect(merged.map((scope) => scope.name)).toEqual(['openid', 'evil:scope'])
    expect(unknownScope).toBeDefined()
    expect(unknownScope?.level).toBe('unknown')
    expect(unknownScope?.label).toBe('Cakupan Akses Baru')
    expect(unknownScope?.statusLabel).toBe('Belum Diverifikasi')
    expect(unknownScope?.label).not.toContain('evil:scope')
  })
})

describe('hasUntrustedScopes', () => {
  it('returns false when all scopes are recognized', () => {
    const list = resolveScopeList('openid profile email')
    expect(hasUntrustedScopes(list)).toBe(false)
  })

  it('returns true when any scope is unknown', () => {
    const list = resolveScopeList('openid evil:scope')
    expect(hasUntrustedScopes(list)).toBe(true)
  })

  it('returns true when any scope is unverified', () => {
    const list = resolveScopeList('openid sso.portal')

    expect(hasUntrustedScopes(list)).toBe(true)
  })

  it('returns false for empty list', () => {
    expect(hasUntrustedScopes([])).toBe(false)
  })
})
