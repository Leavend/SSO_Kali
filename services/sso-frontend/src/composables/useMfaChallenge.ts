/**
 * useMfaChallenge — composable FR-019 / UC-67.
 *
 * Mengemas logika verifikasi MFA challenge saat login:
 *   - Submit TOTP code atau recovery code.
 *   - Handle retry, error, dan countdown timer.
 *   - Redirect ke halaman tujuan setelah verified.
 *
 * 1 composable = 1 domain logic (MFA challenge verification).
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMfaChallengeStore } from '@/stores/mfa-challenge.store'
import { useSessionStore } from '@/stores/session.store'
import type { MfaMethod } from '@/types/mfa.types'

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Challenge expired or not found.': 'Sesi verifikasi telah kedaluwarsa. Silakan login ulang.',
  'Maximum verification attempts exceeded.': 'Terlalu banyak percobaan. Silakan login ulang.',
  'Invalid verification code.': 'Kode verifikasi tidak valid. Silakan coba lagi.',
  'Unsupported MFA method.': 'Metode MFA tidak didukung.',
}

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message] ?? message
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

  const challengeId = computed<string | null>(
    () => challengeStore.challenge?.challenge_id ?? null,
  )

  const expiresAt = computed<string | null>(
    () => challengeStore.challenge?.expires_at ?? null,
  )

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
      const response = await fetch('/api/mfa/challenge/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challenge_id: challengeId.value,
          method: method.value,
          code: code.value.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.authenticated) {
        error.value = translateError(data.error ?? 'Verifikasi gagal.')
        code.value = ''
        return
      }

      // MFA verified — session cookie set by backend
      challengeStore.clear()
      await sessionStore.ensureSession()
      await router.push('/home')
    } catch {
      error.value = 'Gagal memproses verifikasi. Coba lagi beberapa saat.'
    } finally {
      pending.value = false
    }
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
