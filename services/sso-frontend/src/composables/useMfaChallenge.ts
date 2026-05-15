/**
 * useMfaChallenge — composable FR-019 / UC-67.
 *
 * Verifies MFA login challenge via central apiClient-backed mfaApi.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/lib/api/api-error'
import { mfaApi, type MfaChallengeVerifyResponse } from '@/services/mfa.api'
import { useMfaChallengeStore } from '@/stores/mfa-challenge.store'
import { useSessionStore } from '@/stores/session.store'
import type { MfaMethod } from '@/types/mfa.types'

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Challenge expired or not found.': 'Sesi verifikasi telah kedaluwarsa. Silakan login ulang.',
  'Maximum verification attempts exceeded.': 'Terlalu banyak percobaan. Silakan login ulang.',
  'Invalid verification code.': 'Kode verifikasi tidak valid. Silakan coba lagi.',
  'Unsupported MFA method.': 'Metode MFA tidak didukung.',
  'The pending authorization request is no longer valid.':
    'Permintaan otorisasi sudah tidak berlaku. Silakan masuk ulang.',
}

const SAFE_VERIFY_ERROR = 'Gagal memproses verifikasi. Coba lagi beberapa saat.'
const CSRF_ERROR = 'Sesi keamanan kedaluwarsa. Muat ulang halaman lalu coba lagi.'
const RATE_LIMIT_ERROR = 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.'
const EXPIRED_CHALLENGE_ERROR = 'Sesi verifikasi telah kedaluwarsa. Silakan login ulang.'

type MfaContinuation = {
  readonly type: 'authorization_code' | 'consent'
  readonly redirect_uri: string
}

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message] ?? SAFE_VERIFY_ERROR
}

function isSafeContinuationRedirect(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'https:' || url.origin === window.location.origin
  } catch {
    return false
  }
}

export type UseMfaChallengeReturn = {
  readonly method: Ref<MfaMethod>
  readonly code: Ref<string>
  readonly pending: Ref<boolean>
  readonly error: Ref<string | null>
  readonly challengeId: ComputedRef<string | null>
  readonly expiresAt: ComputedRef<string | null>
  readonly methodsAvailable: ComputedRef<readonly MfaMethod[]>
  setMethod: (m: MfaMethod) => void
  submit: () => Promise<void>
  cancel: () => Promise<void>
}

export function useMfaChallenge(): UseMfaChallengeReturn {
  const router = useRouter()
  const challengeStore = useMfaChallengeStore()
  const sessionStore = useSessionStore()

  const method = ref<MfaMethod>('totp')
  const code = ref<string>('')
  const pending = ref<boolean>(false)
  const error = ref<string | null>(null)

  const challengeId = computed<string | null>(() => challengeStore.challenge?.challenge_id ?? null)
  const expiresAt = computed<string | null>(() => challengeStore.challenge?.expires_at ?? null)
  const methodsAvailable = computed<readonly MfaMethod[]>(
    () => challengeStore.challenge?.methods_available ?? [],
  )

  function setMethod(m: MfaMethod): void {
    method.value = m
    code.value = ''
    error.value = null
  }

  async function submit(): Promise<void> {
    if (!challengeId.value || code.value.trim() === '') return

    pending.value = true
    error.value = null

    try {
      const data = await mfaApi.verifyChallenge({
        challenge_id: challengeId.value,
        method: method.value,
        code: code.value.trim(),
      })

      if (!data.authenticated) {
        handleVerificationFailure(data.error)
        return
      }

      challengeStore.clear()

      const continuation = data.continuation
      if (continuation && isSafeContinuationRedirect(continuation.redirect_uri)) {
        window.location.assign(continuation.redirect_uri)
        return
      }

      await sessionStore.ensureSession()
      await router.push('/home')
    } catch (exception) {
      error.value = safeApiErrorMessage(exception)
      code.value = ''
    } finally {
      pending.value = false
    }
  }

  function handleVerificationFailure(rawError: MfaChallengeVerifyResponse['error']): void {
    error.value = translateError(rawError ?? '')
    code.value = ''
  }

  function safeApiErrorMessage(exception: unknown): string {
    if (!(exception instanceof ApiError)) return SAFE_VERIFY_ERROR
    if (exception.status === 419) return CSRF_ERROR
    if (exception.status === 429) return RATE_LIMIT_ERROR
    if (exception.status === 404 || exception.status === 409 || exception.status === 410) {
      return EXPIRED_CHALLENGE_ERROR
    }
    if (exception.status === 422) return translateError(exception.message)
    if (exception.kind === 'timeout' || exception.kind === 'network') return exception.message
    return SAFE_VERIFY_ERROR
  }

  async function cancel(): Promise<void> {
    challengeStore.clear()
    await router.push({ name: 'auth.login' })
  }

  return {
    method,
    code,
    pending,
    error,
    challengeId,
    expiresAt,
    methodsAvailable,
    setMethod,
    submit,
    cancel,
  }
}
