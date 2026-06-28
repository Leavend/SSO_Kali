import { describe, expect, it } from 'vitest'
import type { ClientCreateForm } from '../client-create-form'
import {
  isBackchannelUri,
  isRedirectUri,
  isValidClientId,
  isValidOwnerEmail,
  mergeAvailableScopes,
  parseScopes,
  scopeParityWarnings,
  slugifyClientId,
  toClientCreatePayload,
  validateClientCreateForm,
  validateUriPolicy,
} from '../client-create-form'
import type { ScopeCatalogEntry } from '@/types/clients.types'

const baseForm = (): ClientCreateForm => ({
  display_name: 'Selamat Kerja',
  client_id: 'selamat-kerja',
  owner_email: 'ops@example.com',
  client_type: 'confidential',
  category: 'kepegawaian',
  redirect_uri: 'https://app.example.com/auth/callback',
  backchannel_logout_uri: '',
})

const scope = (name: string, default_allowed = true): ScopeCatalogEntry => ({
  name,
  description: `${name} scope`,
  claims: [],
  default_allowed,
})

describe('slugifyClientId', () => {
  it('lowercases, hyphenates non-alphanumerics, and trims edge hyphens', () => {
    expect(slugifyClientId('  Selamat Kerja!  ')).toBe('selamat-kerja')
    expect(slugifyClientId('My__Cool  App')).toBe('my-cool-app')
    expect(slugifyClientId('Already-Valid-99')).toBe('already-valid-99')
  })

  it('caps the slug at 63 characters', () => {
    expect(slugifyClientId('a'.repeat(80)).length).toBe(63)
  })
})

describe('isValidClientId', () => {
  it('accepts 3–63 lowercase alnum/hyphen ids starting with alnum', () => {
    expect(isValidClientId('abc')).toBe(true)
    expect(isValidClientId('selamat-kerja-99')).toBe(true)
    expect(isValidClientId('a'.repeat(63))).toBe(true)
  })

  it('rejects too-short, too-long, leading-hyphen, and uppercase/space ids', () => {
    expect(isValidClientId('ab')).toBe(false) // 2 chars
    expect(isValidClientId('a'.repeat(64))).toBe(false) // 64 chars
    expect(isValidClientId('-abc')).toBe(false)
    expect(isValidClientId('Abc')).toBe(false)
    expect(isValidClientId('a b')).toBe(false)
    expect(isValidClientId('app_name')).toBe(false)
  })
})

describe('isValidOwnerEmail', () => {
  it('accepts a well-formed address and rejects malformed input', () => {
    expect(isValidOwnerEmail('ops@example.co.id')).toBe(true)
    expect(isValidOwnerEmail('no-at-sign')).toBe(false)
    expect(isValidOwnerEmail('ops@example')).toBe(false)
    expect(isValidOwnerEmail('ops @example.com')).toBe(false)
    expect(isValidOwnerEmail('')).toBe(false)
  })
})

describe('isRedirectUri', () => {
  it('accepts http/https URLs without wildcard or query', () => {
    expect(isRedirectUri('https://app.example.com/auth/callback')).toBe(true)
    expect(isRedirectUri('http://localhost:3000/cb')).toBe(true)
  })

  it('rejects wildcards, query strings, non-http schemes, and garbage', () => {
    expect(isRedirectUri('https://*.example.com/cb')).toBe(false)
    expect(isRedirectUri('https://app.example.com/cb?next=1')).toBe(false)
    expect(isRedirectUri('ftp://app.example.com/cb')).toBe(false)
    expect(isRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isRedirectUri('not a url')).toBe(false)
    expect(isRedirectUri('')).toBe(false)
  })
})

describe('isBackchannelUri', () => {
  const redirect = 'https://app.example.com/auth/callback'

  it('treats empty/whitespace as valid (optional field)', () => {
    expect(isBackchannelUri('', redirect)).toBe(true)
    expect(isBackchannelUri('   ', redirect)).toBe(true)
  })

  it('requires the same origin as the redirect URI', () => {
    expect(isBackchannelUri('https://app.example.com/logout', redirect)).toBe(true)
    expect(isBackchannelUri('https://other.example.com/logout', redirect)).toBe(false)
  })

  it('rejects wildcard/query/invalid backchannel URLs', () => {
    expect(isBackchannelUri('https://app.example.com/*', redirect)).toBe(false)
    expect(isBackchannelUri('https://app.example.com/logout?x=1', redirect)).toBe(false)
    expect(isBackchannelUri('nonsense', redirect)).toBe(false)
  })
})

describe('parseScopes', () => {
  it('splits on whitespace/commas, trims, drops empties, and dedups', () => {
    expect(parseScopes('openid  profile, email ,, openid')).toEqual(['openid', 'profile', 'email'])
    expect(parseScopes('   ')).toEqual([])
  })
})

describe('validateClientCreateForm', () => {
  it('returns an empty map for a fully valid form', () => {
    expect(validateClientCreateForm(baseForm(), ['openid', 'profile'])).toEqual({})
  })

  it('flags each invalid field with its i18n key', () => {
    const errors = validateClientCreateForm(
      {
        display_name: '   ',
        client_id: 'Bad ID',
        owner_email: 'nope',
        client_type: null,
        category: '',
        redirect_uri: 'https://app.example.com/cb?x=1',
        backchannel_logout_uri: 'https://other.example.com/logout',
      },
      [],
    )
    expect(errors).toEqual({
      display_name: 'clients.validation_display_name',
      client_id: 'clients.validation_client_id',
      owner_email: 'clients.validation_owner_email',
      client_type: 'clients.validation_client_type',
      category: 'clients.validation_category',
      redirect_uri: 'clients.validation_redirect_uri',
      backchannel_logout_uri: 'clients.validation_logout_uri',
      scopes: 'clients.validation_scopes',
    })
  })

  it('requires scopes to be non-empty AND include openid', () => {
    expect(validateClientCreateForm(baseForm(), ['profile'])).toEqual({
      scopes: 'clients.validation_scopes',
    })
    expect(validateClientCreateForm(baseForm(), [])).toEqual({
      scopes: 'clients.validation_scopes',
    })
  })
})

describe('toClientCreatePayload', () => {
  it('derives base url / callback path and pins environment + provisioning', () => {
    const payload = toClientCreatePayload(baseForm(), ['openid', 'profile'])
    expect(payload).toEqual({
      app_name: 'Selamat Kerja',
      client_id: 'selamat-kerja',
      environment: 'development',
      client_type: 'confidential',
      app_base_url: 'https://app.example.com',
      callback_path: '/auth/callback',
      logout_path: '/auth/backchannel/logout',
      owner_email: 'ops@example.com',
      provisioning: 'jit',
      allowed_scopes: ['openid', 'profile'],
      category: 'kepegawaian',
    })
  })

  it('uses the backchannel pathname as logout_path when present', () => {
    const form = { ...baseForm(), backchannel_logout_uri: 'https://app.example.com/auth/logout' }
    expect(toClientCreatePayload(form, ['openid']).logout_path).toBe('/auth/logout')
  })

  it('throws when client_type or category is unset', () => {
    expect(() => toClientCreatePayload({ ...baseForm(), client_type: null }, ['openid'])).toThrow()
    expect(() => toClientCreatePayload({ ...baseForm(), category: '' }, ['openid'])).toThrow()
  })
})

describe('validateUriPolicy', () => {
  const ok = {
    redirect_uris: ['https://app.example.com/auth/callback'],
    post_logout_redirect_uris: ['https://app.example.com/auth/loggedout'],
    backchannel_logout_uri: 'https://app.example.com/auth/backchannel',
  }

  it('returns null for a fully valid policy', () => {
    expect(validateUriPolicy(ok)).toBeNull()
  })

  it('requires at least one valid redirect URI', () => {
    expect(
      validateUriPolicy({
        redirect_uris: [],
        post_logout_redirect_uris: [],
        backchannel_logout_uri: '',
      }),
    ).toBe('clients.validation_redirect_uri')
    expect(validateUriPolicy({ ...ok, redirect_uris: ['https://app.example.com/cb?x=1'] })).toBe(
      'clients.validation_redirect_uri',
    )
  })

  it('rejects an invalid post-logout URI and an origin mismatch', () => {
    expect(validateUriPolicy({ ...ok, post_logout_redirect_uris: ['not a url'] })).toBe(
      'clients.validation_logout_uri',
    )
    expect(
      validateUriPolicy({ ...ok, post_logout_redirect_uris: ['https://evil.example.com/out'] }),
    ).toBe('clients.validation_logout_origin')
  })

  it('rejects duplicate URIs across redirect + logout', () => {
    expect(
      validateUriPolicy({
        redirect_uris: ['https://app.example.com/auth/callback'],
        post_logout_redirect_uris: ['https://app.example.com/auth/callback'],
        backchannel_logout_uri: '',
      }),
    ).toBe('clients.validation_uri_duplicate')
  })

  it('rejects an invalid or cross-origin backchannel URI', () => {
    expect(validateUriPolicy({ ...ok, backchannel_logout_uri: 'nonsense' })).toBe(
      'clients.validation_logout_uri',
    )
    expect(
      validateUriPolicy({ ...ok, backchannel_logout_uri: 'https://evil.example.com/bc' }),
    ).toBe('clients.validation_logout_origin')
  })
})

describe('scope catalog helpers', () => {
  const catalog = [scope('openid'), scope('profile'), scope('email')]

  it('mergeAvailableScopes appends client-only scopes after the catalog', () => {
    expect(mergeAvailableScopes(catalog, ['openid', 'legacy:read'])).toEqual([
      'openid',
      'profile',
      'email',
      'legacy:read',
    ])
  })

  it('scopeParityWarnings lists client scopes absent from the catalog', () => {
    expect(scopeParityWarnings(catalog, ['openid', 'legacy:read', 'ghost'])).toEqual([
      'legacy:read',
      'ghost',
    ])
    expect(scopeParityWarnings(catalog, ['openid', 'profile'])).toEqual([])
  })
})
