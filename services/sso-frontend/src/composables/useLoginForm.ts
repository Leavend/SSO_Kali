/**
 * useLoginForm — composable UC-08.
 *
 * Mengemas form state, submission flow, dan error handling khas SSO
 * (anti user-enumeration, validation violations, generic fallback).
 *
 * Pages pemakai hanya perlu `form`, `submit`, `pending`, `bannerError`,
 * `fieldErrors` tanpa tahu detail HTTP.
 */

import { computed, reactive, ref, type ComputedRef, type Reactive, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, isValidationError } from '@/lib/api/api-error'
import { useSessionStore } from '@/stores/session.store'
import { useMfaChallengeStore } from '@/stores/mfa-challenge.store'
import type { SsoLoginResponse } from '@/types/auth.types'

const GENERIC_FAILURE_MESSAGE =
  'Email atau password yang kamu masukkan salah. Silakan coba lagi.'
const UNEXPECTED_FAILURE_MESSAGE = 'Gagal memproses login. Coba lagi beberapa saat.'

/** Map common backend English error messages to Indonesian. */
const ERROR_TRANSLATIONS: Record<string, string> = {
  'The supplied credentials are invalid.': 'Email atau password yang kamu masukkan salah.',
  'These credentials do not match our records.': 'Email atau password yang kamu masukkan salah.',
  'Too many login attempts. Please try again later.': 'Terlalu banyak percobaan login. Coba lagi nanti.',
  'The provided credentials are incorrect.': 'Email atau password yang kamu masukkan salah.',
  'Your account has been disabled.': 'Akun kamu telah dinonaktifkan. Hubungi administrator.',
  'Invalid credentials.': 'Email atau password yang kamu masukkan salah.',
}

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message] ?? message
}

export type LoginFormState = {
  identifier: string
  password: string
}

export type UseLoginFormReturn = {
  readonly form: Reactive<LoginFormState>
  readonly pending: Ref<boolean>
  readonly bannerError: Ref<string | null>
  readonly fieldErrors: Ref<Record<string, string>>
  readonly canSubmit: ComputedRef<boolean>
  submit: () => Promise<void>
}

export function useLoginForm(): UseLoginFormReturn {
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()
  const mfaChallengeStore = useMfaChallengeStore()

  const form = reactive<LoginFormState>({
    identifier: '',
    password: '',
  })

  const pending = ref<boolean>(false)
  const bannerError = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string>>({})

  const canSubmit = computed<boolean>(
    () => !pending.value && form.identifier.trim().length > 0 && form.password.length > 0,
  )

  async function submit(): Promise<void> {
    if (!canSubmit.value) return

    pending.value = true
    bannerError.value = null
    fieldErrors.value = {}

    try {
      const response = await session.login({
        identifier: form.identifier.trim(),
        password: form.password,
        auth_request_id: readAuthRequestId(),
      })
      await onLoginResponse(response)
    } catch (error) {
      applyError(error)
    } finally {
      pending.value = false
    }
  }

  async function onLoginResponse(response: SsoLoginResponse): Promise<void> {
    // FR-019: Handle MFA challenge response
    if ('mfa_required' in response && response.mfa_required) {
      mfaChallengeStore.setChallenge(response.challenge)
      await router.push({ name: 'auth.mfa-challenge' })
      return
    }

    if (!response.authenticated) {
      bannerError.value = GENERIC_FAILURE_MESSAGE
      return
    }

    if (response.next.type === 'continue_authorize' && response.next.auth_request_id) {
      continueAuthorize(response.next.auth_request_id)
      return
    }

    await router.push(readRedirectTarget())
  }

  function applyError(error: unknown): void {
    if (isValidationError(error) && error instanceof ApiError) {
      fieldErrors.value = error.violations.reduce<Record<string, string>>(
        (acc, violation) => {
          acc[violation.field] = violation.message
          return acc
        },
        {},
      )
      bannerError.value = translateError(error.message)
      return
    }

    if (error instanceof ApiError) {
      // Unauthorized / forbidden / rate limit → pesan backend sudah aman (tidak bocor enum).
      bannerError.value = translateError(error.message)
      return
    }

    bannerError.value = UNEXPECTED_FAILURE_MESSAGE
  }

  function readRedirectTarget(): string {
    const value = route.query['redirect']
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
      ? value
      : '/home'
  }

  function readAuthRequestId(): string | null {
    const value = route.query['auth_request_id']
    return typeof value === 'string' && value.length > 0 ? value : null
  }

  function continueAuthorize(authRequestId: string): void {
    const url = new URL('/authorize', window.location.origin)
    url.searchParams.set('auth_request_id', authRequestId)
    window.location.assign(url.toString())
  }

  return { form, pending, bannerError, fieldErrors, canSubmit, submit }
}
