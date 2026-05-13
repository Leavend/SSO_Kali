/**
 * OIDC metadata canonicalization invariants (FR-005 / UC-01 / UC-08).
 *
 * Enforces the contract between the SPA's build-time config and the SSO
 * server's Discovery response:
 *
 *   1. Issuer advertised in Discovery matches what the SPA was built for.
 *   2. All endpoints share the same host as the issuer (no cross-host drift).
 *   3. All endpoints are served over HTTPS.
 *   4. `jwks_uri` lives under the issuer (OIDC Core §10.2.1).
 *   5. Issuer has no trailing slash (RFC 8414 §2 canonical form).
 *
 * Why enforce client-side:
 *   - Catches misconfiguration between frontend env and backend deploys
 *     immediately on first metadata fetch, instead of letting bad tokens
 *     fail silently later.
 *   - Defends against a scenario where an attacker tampers with Discovery
 *     (e.g. DNS hijack) — mismatched host on endpoints is a red flag.
 *
 * The checks are **advisory by default**: called from the OIDC callback to
 * fail-fast before PII is exposed, but tolerant of whitespace/trailing
 * slash on the inbound `expectedIssuer`.
 */

import type { DiscoveryMetadata } from './discovery'

export class CanonicalizationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'issuer_mismatch'
      | 'host_mismatch'
      | 'non_https_endpoint'
      | 'jwks_outside_issuer'
      | 'issuer_trailing_slash',
  ) {
    super(message)
    this.name = 'CanonicalizationError'
  }
}

/**
 * Assert Discovery metadata is canonically consistent and matches the
 * expected issuer. Throws {@link CanonicalizationError} on violation.
 */
export function assertCanonicalMetadata(
  metadata: DiscoveryMetadata,
  expectedIssuer: string,
): void {
  const normalizedExpected = expectedIssuer.replace(/\/$/, '')
  const iss = metadata.issuer

  if (iss.endsWith('/')) {
    throw new CanonicalizationError(
      'Issuer MUST NOT have a trailing slash (RFC 8414 §2).',
      'issuer_trailing_slash',
    )
  }

  if (iss !== normalizedExpected) {
    throw new CanonicalizationError(
      `Discovery issuer "${iss}" does not match expected "${normalizedExpected}".`,
      'issuer_mismatch',
    )
  }

  const issuerHost = hostOf(iss)
  const endpointsToCheck: Array<[string, string | undefined]> = [
    ['authorization_endpoint', metadata.authorization_endpoint],
    ['token_endpoint', metadata.token_endpoint],
    ['userinfo_endpoint', metadata.userinfo_endpoint],
    ['jwks_uri', metadata.jwks_uri],
    ['end_session_endpoint', metadata.end_session_endpoint],
    ['revocation_endpoint', metadata.revocation_endpoint],
  ]

  for (const [name, value] of endpointsToCheck) {
    if (typeof value !== 'string' || value.length === 0) continue

    if (!value.startsWith('https://')) {
      throw new CanonicalizationError(
        `${name} must be HTTPS, got "${value}".`,
        'non_https_endpoint',
      )
    }

    if (hostOf(value) !== issuerHost) {
      throw new CanonicalizationError(
        `${name} host "${hostOf(value)}" differs from issuer host "${issuerHost}".`,
        'host_mismatch',
      )
    }
  }

  if (!metadata.jwks_uri.startsWith(iss)) {
    throw new CanonicalizationError(
      `jwks_uri "${metadata.jwks_uri}" is not under issuer "${iss}" (OIDC Core §10.2.1).`,
      'jwks_outside_issuer',
    )
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
