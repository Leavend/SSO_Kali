/**
 * useOidcAuthorize — UC-07.
 *
 * Generate PKCE + state + nonce, simpan ke sessionStorage, bangun URL
 * `/oauth2/authorize`, lalu redirect user. Tidak me-render UI apapun.
 */

import { getLocationPort } from '@/lib/browser/location-port'
import { readOidcConfig, type OidcConfig } from '@/lib/oidc/config'
import { createNonce, createPkcePair, createState } from '@/lib/oidc/pkce'
import { saveAuthorizeRequest } from '@/lib/oidc/request-storage'

export type AuthorizeOptions = {
  /** Path internal untuk kembali setelah login (mis. `/home`). */
  readonly post_login_redirect?: string
  /** Override scope default dari env. */
  readonly scope?: string
  /** Prompt tambahan untuk IdP (mis. `login`, `consent`). */
  readonly prompt?: 'none' | 'login' | 'consent' | 'select_account'
}

export type UseOidcAuthorizeReturn = {
  start: (options?: AuthorizeOptions) => Promise<void>
}

export function useOidcAuthorize(): UseOidcAuthorizeReturn {
  async function start(options: AuthorizeOptions = {}): Promise<void> {
    const config = readOidcConfig()
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

    getLocationPort().assign(buildAuthorizeUrl(config, pkce.code_challenge, state, nonce, scope, options))
  }

  return { start }
}

function buildAuthorizeUrl(
  config: OidcConfig,
  codeChallenge: string,
  state: string,
  nonce: string,
  scope: string,
  options: AuthorizeOptions,
): string {
  const url = new URL(config.authorize_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.client_id)
  url.searchParams.set('redirect_uri', config.redirect_uri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (options.prompt) url.searchParams.set('prompt', options.prompt)
  return url.toString()
}
