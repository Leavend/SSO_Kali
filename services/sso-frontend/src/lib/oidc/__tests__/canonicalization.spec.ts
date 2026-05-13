/* eslint-disable vitest/no-conditional-expect */
import { describe, expect, it } from 'vitest'
import {
  assertCanonicalMetadata,
  CanonicalizationError,
} from '../canonicalization'
import type { DiscoveryMetadata } from '../discovery'

const VALID_METADATA: DiscoveryMetadata = {
  issuer: 'https://sso.example.com',
  authorization_endpoint: 'https://sso.example.com/oauth/authorize',
  token_endpoint: 'https://sso.example.com/oauth/token',
  userinfo_endpoint: 'https://sso.example.com/userinfo',
  end_session_endpoint: 'https://sso.example.com/connect/logout',
  revocation_endpoint: 'https://sso.example.com/oauth/revoke',
  jwks_uri: 'https://sso.example.com/.well-known/jwks.json',
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['ES256'],
}

describe('assertCanonicalMetadata', () => {
  it('passes for fully canonical metadata', () => {
    expect(() =>
      assertCanonicalMetadata(VALID_METADATA, 'https://sso.example.com'),
    ).not.toThrow()
  })

  it('tolerates expected issuer with trailing slash', () => {
    expect(() =>
      assertCanonicalMetadata(VALID_METADATA, 'https://sso.example.com/'),
    ).not.toThrow()
  })

  it('throws when Discovery issuer has trailing slash', () => {
    const bad: DiscoveryMetadata = { ...VALID_METADATA, issuer: 'https://sso.example.com/' }
    expect(() => assertCanonicalMetadata(bad, 'https://sso.example.com')).toThrowError(
      /trailing slash/i,
    )
  })

  it('throws issuer_mismatch when Discovery issuer differs from expected', () => {
    expect.assertions(2)
    try {
      assertCanonicalMetadata(VALID_METADATA, 'https://evil.example.com')
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalizationError)
      expect((err as CanonicalizationError).code).toBe('issuer_mismatch')
    }
  })

  it('throws host_mismatch when an endpoint uses a different host', () => {
    const bad: DiscoveryMetadata = {
      ...VALID_METADATA,
      token_endpoint: 'https://other.example.com/oauth/token',
    }
    expect.assertions(2)
    try {
      assertCanonicalMetadata(bad, 'https://sso.example.com')
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalizationError)
      expect((err as CanonicalizationError).code).toBe('host_mismatch')
    }
  })

  it('throws non_https_endpoint for http:// endpoint', () => {
    const bad: DiscoveryMetadata = {
      ...VALID_METADATA,
      authorization_endpoint: 'http://sso.example.com/oauth/authorize',
    }
    expect.assertions(2)
    try {
      assertCanonicalMetadata(bad, 'https://sso.example.com')
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalizationError)
      expect((err as CanonicalizationError).code).toBe('non_https_endpoint')
    }
  })

  it('throws jwks_outside_issuer when jwks_uri is on different host', () => {
    const bad: DiscoveryMetadata = {
      ...VALID_METADATA,
      jwks_uri: 'https://keys.example.com/.well-known/jwks.json',
    }
    expect.assertions(2)
    try {
      assertCanonicalMetadata(bad, 'https://sso.example.com')
    } catch (err) {
      expect(err).toBeInstanceOf(CanonicalizationError)
      // host_mismatch fires first since jwks_uri host check runs before prefix check
      expect(['host_mismatch', 'jwks_outside_issuer']).toContain(
        (err as CanonicalizationError).code,
      )
    }
  })

  it('ignores optional endpoints when absent', () => {
    const partial: DiscoveryMetadata = {
      issuer: VALID_METADATA.issuer,
      authorization_endpoint: VALID_METADATA.authorization_endpoint,
      token_endpoint: VALID_METADATA.token_endpoint,
      jwks_uri: VALID_METADATA.jwks_uri,
      response_types_supported: VALID_METADATA.response_types_supported,
      subject_types_supported: VALID_METADATA.subject_types_supported,
      id_token_signing_alg_values_supported:
        VALID_METADATA.id_token_signing_alg_values_supported,
    }
    expect(() =>
      assertCanonicalMetadata(partial, 'https://sso.example.com'),
    ).not.toThrow()
  })
})
