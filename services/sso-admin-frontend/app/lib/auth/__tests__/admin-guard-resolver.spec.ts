import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLoginUrl, normalizeBasePath, resolveBootstrapFailure } from '../admin-guard-resolver'

describe('buildLoginUrl', () => {
  it('builds a same-origin login URL with an encoded base-prefixed return_to', () => {
    expect(buildLoginUrl('/', 'https://sso.test', '/__vue-preview')).toBe(
      'https://sso.test/auth/login?return_to=%2F__vue-preview%2F',
    )
    expect(buildLoginUrl('/oidc-foundation', 'https://sso.test', '/__vue-preview')).toBe(
      'https://sso.test/auth/login?return_to=%2F__vue-preview%2Foidc-foundation',
    )
  })

  it('normalizes the base path (leading + trailing slash)', () => {
    expect(normalizeBasePath('app')).toBe('/app/')
    expect(normalizeBasePath('/app')).toBe('/app/')
    expect(normalizeBasePath('/app/')).toBe('/app/')
  })
})

describe('resolveBootstrapFailure', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      assign: vi.fn<(url: string) => void>(),
      origin: 'https://sso.test',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const O = 'https://sso.test'
  const B = '/__vue-preview'

  it('is pure: never touches globalThis.location', () => {
    resolveBootstrapFailure('unauthenticated', '/', O, B)
    expect(globalThis.location.assign).not.toHaveBeenCalled()
  })

  it('maps unauthenticated to a login resolution carrying the built URL', () => {
    expect(resolveBootstrapFailure('unauthenticated', '/', O, B)).toEqual({
      kind: 'login',
      url: 'https://sso.test/auth/login?return_to=%2F__vue-preview%2F',
    })
  })

  it('maps forbidden to the forbidden route', () => {
    expect(resolveBootstrapFailure('forbidden', '/', O, B)).toEqual({
      kind: 'route',
      to: { name: 'admin.forbidden' },
    })
  })

  it('maps mfa_enrollment_required and step_up_required with return_to', () => {
    expect(resolveBootstrapFailure('mfa_enrollment_required', '/x', O, B)).toEqual({
      kind: 'route',
      to: { name: 'admin.mfa-required', query: { return_to: '/x' } },
    })
    expect(resolveBootstrapFailure('step_up_required', '/x', O, B)).toEqual({
      kind: 'route',
      to: { name: 'admin.step-up-required', query: { return_to: '/x' } },
    })
  })

  it('maps api_unreachable and error to their safe views', () => {
    expect(resolveBootstrapFailure('api_unreachable', '/', O, B)).toEqual({
      kind: 'route',
      to: { name: 'admin.api-unreachable' },
    })
    expect(resolveBootstrapFailure('error', '/', O, B)).toEqual({
      kind: 'route',
      to: { name: 'admin.error' },
    })
  })

  it('treats authenticated and null as allow', () => {
    expect(resolveBootstrapFailure('authenticated', '/', O, B)).toEqual({ kind: 'allow' })
    expect(resolveBootstrapFailure(null, '/', O, B)).toEqual({ kind: 'allow' })
  })
})
