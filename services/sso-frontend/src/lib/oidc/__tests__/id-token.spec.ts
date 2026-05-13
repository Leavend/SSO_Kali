import { describe, expect, it } from 'vitest'
import { IdTokenValidationError, parseIdToken, validateIdToken } from '../id-token'

function makeToken(payload: Record<string, unknown>): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' })
  const body = base64url(payload)
  // Signature is intentionally opaque — FE hanya memvalidasi klaim.
  return `${header}.${body}.sig`
}

function base64url(payload: Record<string, unknown>): string {
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '')
}

const ISSUER = 'https://sso.example.com'
const AUDIENCE = 'sso-frontend-portal'
const NONCE = 'nonce-xyz'

describe('parseIdToken', () => {
  it('returns claims when JWT is well-formed', () => {
    const token = makeToken({ iss: ISSUER, sub: 'user-1', exp: now() + 300 })
    const claims = parseIdToken(token)
    expect(claims.iss).toBe(ISSUER)
    expect(claims.sub).toBe('user-1')
  })

  it('throws malformed for bad segments', () => {
    expect(() => parseIdToken('not.a.jwt')).toThrow(IdTokenValidationError)
    expect(() => parseIdToken('onlyone')).toThrow(IdTokenValidationError)
  })
})

describe('validateIdToken', () => {
  it('returns claims when all assertions pass', async () => {
    const token = makeToken({
      iss: ISSUER,
      aud: AUDIENCE,
      nonce: NONCE,
      exp: now() + 300,
      iat: now() - 10,
      sub: 'user-42',
    })
    const claims = await validateIdToken({
      token,
      expectedIssuer: ISSUER,
      expectedAudience: AUDIENCE,
      expectedNonce: NONCE,
    })
    expect(claims.sub).toBe('user-42')
  })

  it('rejects mismatched issuer', async () => {
    const token = makeToken({
      iss: 'https://other.issuer',
      aud: AUDIENCE,
      nonce: NONCE,
      exp: now() + 300,
      iat: now(),
      sub: 'u',
    })
    await expect(
      validateIdToken({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUDIENCE,
        expectedNonce: NONCE,
      }),
    ).rejects.toThrow(/issuer/i)
  })

  it('rejects mismatched audience', async () => {
    const token = makeToken({
      iss: ISSUER,
      aud: ['other-client'],
      nonce: NONCE,
      exp: now() + 300,
      iat: now(),
      sub: 'u',
    })
    await expect(
      validateIdToken({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUDIENCE,
        expectedNonce: NONCE,
      }),
    ).rejects.toThrow(/audience/i)
  })

  it('rejects expired tokens', async () => {
    const token = makeToken({
      iss: ISSUER,
      aud: AUDIENCE,
      nonce: NONCE,
      exp: now() - 3600,
      iat: now() - 7200,
      sub: 'u',
    })
    await expect(
      validateIdToken({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUDIENCE,
        expectedNonce: NONCE,
      }),
    ).rejects.toThrow(/expired/i)
  })

  it('rejects mismatched nonce', async () => {
    const token = makeToken({
      iss: ISSUER,
      aud: AUDIENCE,
      nonce: 'different-nonce',
      exp: now() + 300,
      iat: now(),
      sub: 'u',
    })
    await expect(
      validateIdToken({
        token,
        expectedIssuer: ISSUER,
        expectedAudience: AUDIENCE,
        expectedNonce: NONCE,
      }),
    ).rejects.toThrow(/nonce/i)
  })

  it('accepts audience delivered as array containing expected client_id', async () => {
    const token = makeToken({
      iss: ISSUER,
      aud: ['other', AUDIENCE],
      nonce: NONCE,
      exp: now() + 300,
      iat: now(),
      sub: 'u',
    })
    const claims = await validateIdToken({
      token,
      expectedIssuer: ISSUER,
      expectedAudience: AUDIENCE,
      expectedNonce: NONCE,
    })
    expect(claims.sub).toBe('u')
  })
})

function now(): number {
  return Math.floor(Date.now() / 1000)
}
