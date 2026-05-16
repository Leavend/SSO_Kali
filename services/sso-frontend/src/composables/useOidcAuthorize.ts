/**
 * useOidcAuthorize \u2014 UC-07 / FR-021 / FR-023 / FR-027.
 *
 * Generates PKCE + state + nonce, persists the authorize request, and
 * redirects the user to the authorization endpoint.
 *
 * Hardening:
 *   - FE-FR023-001: the authorization_endpoint is read from the validated
 *     Discovery document instead of a configurable env override that may
 *     drift from the backend canonical issuer. The local `OidcConfig`
 *     `authorize_endpoint` is only used as a last-resort fallback when
 *     Discovery is unreachable AND the configured value matches the
 *     issuer URL we trust.
 *   - FE-FR021-001: first-class typed support for OIDC step-up parameters
 *     `acr_values` and `max_age` (RFC 6749 + OIDC Core 1.0 \u00a73.1.2.1).
 *   - FE-FR027-001: every defined `prompt` value (`none`, `login`,
 *     `consent`, `select_account`) is forwarded.
 *
 * Storage rules (standart-quality-code \u00a713.1):
 *   - Tokens / secrets are NEVER stored.
 *   - We persist only PKCE verifier + state + nonce + validated config.
 */

import { readOidcConfig, type OidcConfig } from '@/lib/oidc/config'
import { createNonce, createPkcePair, createState } from '@/lib/oidc/pkce'
import { saveAuthorizeRequest } from '@/lib/oidc/request-storage'
import { fetchDiscovery, DiscoveryFetchError } from '@/lib/oidc/discovery'

export type OidcPrompt = 'none' | 'login' | 'consent' | 'select_account'

export type AuthorizeOptions = {
  /** Path internal untuk kembali setelah login (mis. `/home`). */
  readonly post_login_redirect?: string
  /** Override scope default dari env. */
  readonly scope?: string
  /** Prompt tambahan untuk IdP (mis. `login`, `consent`). */
  readonly prompt?: OidcPrompt
  /**
   * FE-FR021-001 \u2014 Step-up: requested ACR values, e.g. `urn:sso:loa:mfa`.
   * Multiple ACRs are space-delimited per OIDC Core 1.0 \u00a73.1.2.1.
   */
  readonly acr_values?: string | readonly string[]
  /**
   * FE-FR021-001 \u2014 Force re-authentication if the existing session is older
   * than the given seconds. `0` forces re-auth on every request.
   * Negative or non-finite values are dropped silently.
   */
  readonly max_age?: number
}

export type UseOidcAuthorizeReturn = {
  start: (options?: AuthorizeOptions) => Promise<void>
}

export class OidcDiscoveryDriftError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OidcDiscoveryDriftError'
  }
}

export function useOidcAuthorize(): UseOidcAuthorizeReturn {
  async function start(options: AuthorizeOptions = {}): Promise<void> {
    const config = readOidcConfig()
    const authorizeEndpoint = await resolveAuthorizationEndpoint(config)

    const pkce = await createPkcePair()
    const state = createState()
    const nonce = createNonce()
    const scope = options.scope ?? config.scope

    saveAuthorizeRequest({
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      state,
      nonce,
      code_verifier: pkce.code_verifier,
      scope,
      post_login_redirect: options.post_login_redirect ?? '/home',
      issuer: config.issuer,
      issued_at: Date.now(),
    })

    window.location.assign(
      buildAuthorizeUrl(authorizeEndpoint, config, pkce.code_challenge, state, nonce, scope, options),
    )
  }

  return { start }
}

/**
 * Resolve the authorization endpoint from validated Discovery metadata.
 *
 * If the configured fallback endpoint disagrees with the Discovery document
 * we throw {@link OidcDiscoveryDriftError} \u2014 silently following the local
 * fallback would let an attacker who controls env config divert the
 * browser to a foreign endpoint.
 */
async function resolveAuthorizationEndpoint(config: OidcConfig): Promise<string> {
  const discoveryUrl = `${config.issuer.replace(/\/$/u, '')}/.well-known/openid-configuration`

  try {
    const metadata = await fetchDiscovery(discoveryUrl)

    if (metadata.issuer.replace(/\/$/u, '') !== config.issuer.replace(/\/$/u, '')) {
      throw new OidcDiscoveryDriftError(
        'Discovery issuer does not match configured issuer.',
      )
    }

    return metadata.authorization_endpoint
  } catch (err) {
    if (err instanceof OidcDiscoveryDriftError) throw err
    if (!(err instanceof DiscoveryFetchError)) throw err

    // Discovery unreachable. Only fall back to local config if the local
    // endpoint URL is rooted under the trusted issuer (defends against
    // env injection redirecting authorize to an attacker host).
    if (!sharesOrigin(config.authorize_endpoint, config.issuer)) {
      throw new OidcDiscoveryDriftError(
        'Configured authorize_endpoint is not under the trusted issuer.',
      )
    }
    return config.authorize_endpoint
  }
}

function sharesOrigin(candidate: string, issuer: string): boolean {
  try {
    return new URL(candidate).origin === new URL(issuer).origin
  } catch {
    return false
  }
}

function buildAuthorizeUrl(
  authorizeEndpoint: string,
  config: OidcConfig,
  codeChallenge: string,
  state: string,
  nonce: string,
  scope: string,
  options: AuthorizeOptions,
): string {
  const url = new URL(authorizeEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.client_id)
  url.searchParams.set('redirect_uri', config.redirect_uri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  if (options.prompt) url.searchParams.set('prompt', options.prompt)

  const acr = normalizeAcrValues(options.acr_values)
  if (acr) url.searchParams.set('acr_values', acr)

  const maxAge = normalizeMaxAge(options.max_age)
  if (maxAge !== null) url.searchParams.set('max_age', String(maxAge))

  return url.toString()
}

function normalizeAcrValues(value: AuthorizeOptions['acr_values']): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
    return cleaned.length > 0 ? cleaned.join(' ') : null
  }

  return null
}

function normalizeMaxAge(value: AuthorizeOptions['max_age']): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  if (value < 0) return null
  return Math.floor(value)
}
