/**
 * useOidcCallback — UC-13 + UC-14.
 *
 * Mengambil `code`/`state` dari query, validasi state terhadap snapshot
 * yang disimpan saat authorize, exchange code di `/oauth2/token`, dan
 * validasi `nonce` pada ID Token.
 */

import { ref, type Ref } from 'vue'
import { exchangeAuthorizationCode, type TokenResponse } from '@/services/oidc.api'
import { validateIdToken, type IdTokenClaims } from '@/lib/oidc/id-token'
import { takeAuthorizeRequest, type AuthorizeRequestSnapshot } from '@/lib/oidc/request-storage'

export type OidcCallbackError =
  | 'missing_params'
  | 'state_missing'
  | 'state_mismatch'
  | 'authorize_error'
  | 'token_exchange_failed'
  | 'id_token_invalid'

export type OidcCallbackResult = {
  readonly tokens: TokenResponse
  readonly claims: IdTokenClaims
  readonly post_login_redirect: string
}

export type OidcCallbackQuery = {
  readonly code?: string
  readonly state?: string
  readonly error?: string
  readonly error_description?: string
}

export type UseOidcCallbackReturn = {
  readonly pending: Ref<boolean>
  readonly error: Ref<OidcCallbackError | null>
  readonly errorDescription: Ref<string | null>
  readonly result: Ref<OidcCallbackResult | null>
  handle: (query: OidcCallbackQuery) => Promise<OidcCallbackResult | null>
}

export function useOidcCallback(): UseOidcCallbackReturn {
  const pending = ref<boolean>(false)
  const error = ref<OidcCallbackError | null>(null)
  const errorDescription = ref<string | null>(null)
  const result = ref<OidcCallbackResult | null>(null)

  async function handle(query: OidcCallbackQuery): Promise<OidcCallbackResult | null> {
    pending.value = true
    error.value = null
    errorDescription.value = null
    result.value = null

    try {
      if (query.error) {
        return fail('authorize_error', query.error_description ?? query.error)
      }

      if (!query.code || !query.state) {
        return fail('missing_params', 'Parameter code atau state tidak ditemukan.')
      }

      const snapshot = takeAuthorizeRequest()
      if (!snapshot) {
        return fail('state_missing', 'Sesi authorize tidak ditemukan.')
      }

      if (snapshot.state !== query.state) {
        return fail('state_mismatch', 'State tidak cocok. Kemungkinan CSRF atau sesi expired.')
      }

      const tokens = await exchangeAuthorizationCode({
        token_endpoint: resolveTokenEndpoint(snapshot),
        client_id: snapshot.client_id,
        code: query.code,
        redirect_uri: snapshot.redirect_uri,
        code_verifier: snapshot.code_verifier,
      }).catch(() => null)

      if (!tokens) {
        return fail('token_exchange_failed', 'Gagal menukar authorization code.')
      }

      const claims = await safeValidateIdToken(tokens.id_token, snapshot)
      if (!claims) {
        return fail('id_token_invalid', 'ID Token tidak valid.')
      }

      const payload: OidcCallbackResult = {
        tokens,
        claims,
        post_login_redirect: snapshot.post_login_redirect,
      }
      result.value = payload
      return payload
    } finally {
      pending.value = false
    }
  }

  function fail(code: OidcCallbackError, description: string): null {
    error.value = code
    errorDescription.value = description
    return null
  }

  return { pending, error, errorDescription, result, handle }
}

function resolveTokenEndpoint(snapshot: AuthorizeRequestSnapshot): string {
  // FR-005: derive from snapshot issuer with canonical /oauth/token path
  // (aligned with backend). Using the snapshot ties the token exchange to
  // whatever issuer authorized the flow, preventing cross-issuer confusion.
  return `${snapshot.issuer.replace(/\/$/, '')}/oauth/token`
}

async function safeValidateIdToken(
  token: string,
  snapshot: AuthorizeRequestSnapshot,
): Promise<IdTokenClaims | null> {
  try {
    return await validateIdToken({
      token,
      expectedIssuer: snapshot.issuer,
      expectedAudience: snapshot.client_id,
      expectedNonce: snapshot.nonce,
    })
  } catch {
    return null
  }
}
