import { webcrypto } from 'node:crypto'
import { getConfig } from './config.js'

export function generateCodeVerifier(): string {
  return base64UrlEncode(webcrypto.getRandomValues(new Uint8Array(32)))
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await webcrypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

export function generateState(): string {
  return base64UrlEncode(webcrypto.getRandomValues(new Uint8Array(16)))
}

export function generateNonce(): string {
  return base64UrlEncode(webcrypto.getRandomValues(new Uint8Array(16)))
}

export function buildAuthorizeUrl(params: {
  readonly state: string
  readonly nonce: string
  readonly codeChallenge: string
  readonly loginHint?: string
}): string {
  const config = getConfig()
  const url = new URL(config.authorizeUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile email offline_access')
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  if (params.loginHint) {
    url.searchParams.set('login_hint', params.loginHint)
  }

  return url.toString()
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}
