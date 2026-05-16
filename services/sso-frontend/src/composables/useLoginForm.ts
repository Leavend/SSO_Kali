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
const LOCKED_OR_DISABLED_MESSAGE =
  'Akun tidak dapat digunakan untuk masuk saat ini. Hubungi administrator jika kamu membutuhkan bantuan.'
const RATE_LIMIT_MESSAGE = 'Terlalu banyak percobaan login. Coba lagi dalam {seconds} detik.'

/**
 * FE-FR022-001 / FR-022 — password lifecycle:
 *   - Backend `password_expired` MUST surface localized safe copy plus a
 *     primary CTA pointing to the credential lifecycle (change password)
 *     flow. The technical `error_description` is dropped on the floor.
 */
const PASSWORD_EXPIRED_MESSAGE =
  'Password kamu telah kedaluwarsa. Ubah password sebelum melanjutkan login.'
const PASSWORD_EXPIRED_CTA_LABEL = 'Ubah Password'
const PASSWORD_EXPIRED_CTA_HREF = '/security'
const MFA_REENROLL_MESSAGE =
  'Akun kamu telah direset oleh admin. Aktifkan kembali autentikasi multi-faktor (MFA) sebelum melanjutkan.'

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

export type LoginAdvisoryAction = {
  readonly label: string
  readonly href: string
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
  readonly retryAfterSeconds: Ref<number>
  readonly canSubmit: ComputedRef<boolean>
  /** Optional next-action CTA — e.g. "Ubah Password" for password_expired. */
  readonly advisoryAction: Ref<LoginAdvisoryAction | null>
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
  const retryAfterSeconds = ref<number>(0)
  const advisoryAction = ref<LoginAdvisoryAction | null>(null)
  let retryTimer: ReturnType<typeof window.setInterval> | null = null

  const canSubmit = computed<boolean>(
    () =>
      !pending.value &&
      retryAfterSeconds.value <= 0 &&
      form.identifier.trim().length > 0 &&
      form.password.length > 0,
  )

  async function submit(): Promise<void> {
    if (!canSubmit.value) return

    pending.value = true
    bannerError.value = null
    fieldErrors.value = {}
    advisoryAction.value = null

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

    // BE-FR020-001: lost-factor recovery — admin reset MFA, force enrolment.
    if (
      !response.authenticated &&
      'error' in response &&
      response.error === 'mfa_reenrollment_required'
    ) {
      bannerError.value = response.message
      await router.push({ name: 'portal.security', query: { reason: 'mfa_reset' } })
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
      applyStructuredLoginError(error)
      return
    }

    bannerError.value = UNEXPECTED_FAILURE_MESSAGE
  }

  function applyStructuredLoginError(error: ApiError): void {
    if (error.status === 429) {
      startRetryCountdown(error.retryAfterSeconds ?? 60)
      return
    }

    // FE-FR022-001 — password_expired (BE returns 403 with code).
    if (error.status === 403 && error.code === 'password_expired') {
      bannerError.value = PASSWORD_EXPIRED_MESSAGE
      advisoryAction.value = {
        label: PASSWORD_EXPIRED_CTA_LABEL,
        href: PASSWORD_EXPIRED_CTA_HREF,
      }
      return
    }

    // BE-FR020-001 — lost-factor recovery (admin reset MFA).
    if (error.status === 403 && error.code === 'mfa_reenrollment_required') {
      bannerError.value = MFA_REENROLL_MESSAGE
      advisoryAction.value = {
        label: 'Aktifkan MFA',
        href: '/security/mfa',
      }
      return
    }

    if (error.status === 423 || error.status === 403) {
      bannerError.value = LOCKED_OR_DISABLED_MESSAGE
      return
    }

    if (error.status === 401) {
      bannerError.value = GENERIC_FAILURE_MESSAGE
      return
    }

    bannerError.value = safeLoginErrorMessage(error)
  }

  function startRetryCountdown(seconds: number): void {
    if (retryTimer) window.clearInterval(retryTimer)
    retryAfterSeconds.value = Math.max(1, seconds)
    updateRateLimitMessage()
    retryTimer = window.setInterval(() => {
      retryAfterSeconds.value = Math.max(0, retryAfterSeconds.value - 1)
      if (retryAfterSeconds.value <= 0 && retryTimer) {
        window.clearInterval(retryTimer)
        retryTimer = null
      }
      updateRateLimitMessage()
    }, 1000)
  }

  function updateRateLimitMessage(): void {
    bannerError.value = retryAfterSeconds.value > 0
      ? RATE_LIMIT_MESSAGE.replace('{seconds}', retryAfterSeconds.value.toString())
      : null
  }

  function safeLoginErrorMessage(error: ApiError): string {
    if (error.status >= 500 || error.status === 0) return UNEXPECTED_FAILURE_MESSAGE
    return translateError(error.message)
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

  return { form, pending, bannerError, fieldErrors, retryAfterSeconds, canSubmit, advisoryAction, submit }
}
