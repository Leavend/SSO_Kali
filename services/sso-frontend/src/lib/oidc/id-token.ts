/**
 * OIDC ID Token parser & validator.
 *
 * **Security**: By default validates issuer/audience/exp/nonce only. Pass
 * `jwksUrl` to `validateIdToken()` to additionally verify the ES256
 * signature via native WebCrypto (no external dep). Signature verification
 * proves the token was issued by the holder of the signing private key,
 * closing the trust gap for scenarios where the token arrives via
 * untrusted channels.
 *
 * Validations:
 *   - Structure: 3 JWT segments.
 *   - Signature: ES256 via JWKS (if `jwksUrl` provided).
 *   - Issuer: matches configuration.
 *   - Audience: contains client_id.
 *   - Expiration: `exp` not past (60s clock skew tolerance).
 *   - Nonce: matches the value stored at authorize time.
 */

import { fetchJwks, verifyJwtSignature, SignatureVerificationError } from './jwks'

export type IdTokenClaims = {
  readonly iss: string
  readonly sub: string
  readonly aud: string | readonly string[]
  readonly exp: number
  readonly iat: number
  readonly nonce?: string
  readonly [key: string]: unknown
}

export type IdTokenValidationInput = {
  readonly token: string
  readonly expectedIssuer: string
  readonly expectedAudience: string
  readonly expectedNonce: string
  /** Optional. If set, verify ES256 signature against this JWKS endpoint. */
  readonly jwksUrl?: string
}

export class IdTokenValidationError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'malformed'
      | 'issuer_mismatch'
      | 'audience_mismatch'
      | 'expired'
      | 'nonce_mismatch'
      | 'signature_invalid',
  ) {
    super(message)
    this.name = 'IdTokenValidationError'
  }
}

const CLOCK_SKEW_SECONDS = 60

export function parseIdToken(token: string): IdTokenClaims {
  const segments = token.split('.')
  if (segments.length !== 3) {
    throw new IdTokenValidationError('ID Token malformed.', 'malformed')
  }

  const payload = segments[1]!
  try {
    return JSON.parse(base64UrlDecode(payload)) as IdTokenClaims
  } catch {
    throw new IdTokenValidationError('ID Token malformed.', 'malformed')
  }
}

export async function validateIdToken(input: IdTokenValidationInput): Promise<IdTokenClaims> {
  // Signature verification first — if provided, it's the strongest trust anchor.
  if (input.jwksUrl) {
    try {
      const keys = await fetchJwks(input.jwksUrl)
      const ok = await verifyJwtSignature(input.token, keys)
      if (!ok) {
        throw new IdTokenValidationError('ID Token signature invalid.', 'signature_invalid')
      }
    } catch (err) {
      if (err instanceof IdTokenValidationError) throw err
      if (err instanceof SignatureVerificationError) {
        throw new IdTokenValidationError(err.message, 'signature_invalid')
      }
      throw new IdTokenValidationError('ID Token signature verification failed.', 'signature_invalid')
    }
  }

  const claims = parseIdToken(input.token)

  if (claims.iss !== input.expectedIssuer) {
    throw new IdTokenValidationError('ID Token issuer mismatch.', 'issuer_mismatch')
  }

  if (!audienceMatches(claims.aud, input.expectedAudience)) {
    throw new IdTokenValidationError('ID Token audience mismatch.', 'audience_mismatch')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    throw new IdTokenValidationError('ID Token expired.', 'expired')
  }

  if (claims.nonce !== input.expectedNonce) {
    throw new IdTokenValidationError('ID Token nonce mismatch.', 'nonce_mismatch')
  }

  return claims
}

function audienceMatches(
  aud: string | readonly string[] | undefined,
  expected: string,
): boolean {
  if (typeof aud === 'string') return aud === expected
  if (Array.isArray(aud)) return aud.includes(expected)
  return false
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(input.length + ((4 - (input.length % 4)) % 4), '=')
  return atob(padded)
}

