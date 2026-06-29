import { describe, expect, it } from 'vitest'
import { filterProviders, parseClaimsJson } from '../external-idps-list'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const make = (over: Partial<ExternalIdentityProvider>): ExternalIdentityProvider => ({
  provider_key: 'acme',
  display_name: 'Acme IdP',
  issuer: 'https://idp.acme.test',
  metadata_url: 'https://idp.acme.test/.well-known/openid-configuration',
  client_id: 'sso',
  ...over,
})

const providers: readonly ExternalIdentityProvider[] = [
  make({ provider_key: 'acme', display_name: 'Acme IdP', issuer: 'https://idp.acme.test' }),
  make({ provider_key: 'globex', display_name: 'Globex SSO', issuer: 'https://login.globex.test' }),
]

describe('filterProviders', () => {
  it('returns the same ref for an empty/whitespace query', () => {
    expect(filterProviders(providers, '')).toBe(providers)
    expect(filterProviders(providers, '  ')).toBe(providers)
  })
  it('matches display_name / provider_key / issuer (case-insensitive)', () => {
    expect(filterProviders(providers, 'globex').map((p) => p.provider_key)).toEqual(['globex'])
    expect(filterProviders(providers, 'ACME').map((p) => p.provider_key)).toEqual(['acme'])
    expect(filterProviders(providers, 'login.globex').map((p) => p.provider_key)).toEqual([
      'globex',
    ])
  })
  it('returns [] when nothing matches', () => {
    expect(filterProviders(providers, 'zzz')).toEqual([])
  })
})

describe('parseClaimsJson', () => {
  it('accepts a JSON object', () => {
    expect(parseClaimsJson('{"sub":"x"}')).toEqual({ ok: true, value: { sub: 'x' } })
  })
  it('rejects malformed JSON without throwing', () => {
    expect(parseClaimsJson('{bad')).toEqual({ ok: false, error: 'syntax' })
  })
  it('rejects non-object JSON', () => {
    expect(parseClaimsJson('[1,2]')).toEqual({ ok: false, error: 'not_object' })
    expect(parseClaimsJson('"x"')).toEqual({ ok: false, error: 'not_object' })
  })
})
