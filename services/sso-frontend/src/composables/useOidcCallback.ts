/**
 * useOidcCallback — UC-13 + UC-14.
 *
 * FE-FR013-001: Browser-side callback only forwards `code`/`state` to the
 * same-origin BFF. Token exchange, ID-token validation, principal bootstrap,
 * and session storage happen server-side; the SPA never receives raw OAuth
 * tokens.
 */

import { ref, type Ref } from 'vue'
import {
  completeOidcCallback,
  type OidcCallbackSessionResult,
} from '@/services/oidc-callback.api'

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

      const sessionResult = await completeOidcCallback({
        code: query.code,
        state: query.state,
      }).catch(() => null)

      if (!sessionResult) {
        return fail('session_exchange_failed', 'Gagal menyiapkan sesi aman.')
      }

      result.value = sessionResult
      return sessionResult
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
