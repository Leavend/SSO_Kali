/**
 * useOidcCallback — UC-13 + UC-14.
 *
 * FE-FR013-001: Browser-side callback only forwards `code`/`state` to the
 * same-origin BFF. Token exchange, ID-token validation, principal bootstrap,
 * and session storage happen server-side; the SPA never receives raw OAuth
 * tokens.
 *
 * FE-FR028-001 / FR-028: Raw `error_description` from the authorize redirect
 * is technical-control text and MUST NOT be rendered. We map known OAuth
 * codes to localized safe copy via `resolveOAuthErrorMessage`; unknown codes
 * fall through to a generic message.
 */

import { ref, type Ref } from 'vue'
import {
  completeOidcCallback,
  type OidcCallbackSessionResult,
} from '@/services/oidc-callback.api'
import { resolveOAuthErrorMessage } from '@/lib/oidc/oauth-error-message'

export type OidcCallbackError =
  | 'missing_params'
  | 'authorize_error'
  | 'session_exchange_failed'

export type OidcCallbackResult = OidcCallbackSessionResult

export type OidcCallbackQuery = {
  readonly code?: string
  readonly state?: string
  readonly error?: string
  readonly error_description?: string
}

export type UseOidcCallbackReturn = {
  readonly pending: Ref<boolean>
  readonly error: Ref<OidcCallbackError | null>
  /**
   * Localized, safe-to-render copy. Backend-supplied `error_description`
   * is intentionally not exposed here.
   */
  readonly errorMessage: Ref<string | null>
  /** Stable OAuth error code (e.g. 'access_denied') for analytics/branching. */
  readonly errorCode: Ref<string | null>
  /** @deprecated kept for legacy callers; mirrors `errorMessage`. */
  readonly errorDescription: Ref<string | null>
  readonly result: Ref<OidcCallbackResult | null>
  handle: (query: OidcCallbackQuery) => Promise<OidcCallbackResult | null>
}

const MISSING_PARAMS_COPY =
  'Tautan callback login tidak lengkap. Mulai ulang dari halaman login.'
const SESSION_EXCHANGE_FAILED_COPY =
  'Gagal menyiapkan sesi aman. Coba lagi beberapa saat.'

export function useOidcCallback(): UseOidcCallbackReturn {
  const pending = ref<boolean>(false)
  const error = ref<OidcCallbackError | null>(null)
  const errorMessage = ref<string | null>(null)
  const errorCode = ref<string | null>(null)
  const result = ref<OidcCallbackResult | null>(null)

  async function handle(query: OidcCallbackQuery): Promise<OidcCallbackResult | null> {
    pending.value = true
    error.value = null
    errorMessage.value = null
    errorCode.value = null
    result.value = null

    try {
      if (query.error) {
        return failAuthorize(query)
      }

      if (!query.code || !query.state) {
        return fail('missing_params', MISSING_PARAMS_COPY)
      }

      const sessionResult = await completeOidcCallback({
        code: query.code,
        state: query.state,
      }).catch(() => null)

      if (!sessionResult) {
        return fail('session_exchange_failed', SESSION_EXCHANGE_FAILED_COPY)
      }

      result.value = sessionResult
      return sessionResult
    } finally {
      pending.value = false
    }
  }

  function fail(code: OidcCallbackError, message: string): null {
    error.value = code
    errorMessage.value = message
    return null
  }

  function failAuthorize(query: OidcCallbackQuery): null {
    errorCode.value = typeof query.error === 'string' ? query.error : null
    return fail('authorize_error', resolveOAuthErrorMessage(query))
  }

  return {
    pending,
    error,
    errorMessage,
    errorCode,
    errorDescription: errorMessage,
    result,
    handle,
  }
}
