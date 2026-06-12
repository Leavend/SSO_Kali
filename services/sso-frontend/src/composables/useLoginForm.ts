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
import { adminFrontendUrlForTarget, isAdminFrontendTarget } from '@/lib/admin-frontend-target'
import { useSessionStore } from '@/stores/session.store'
import { useMfaChallengeStore } from '@/stores/mfa-challenge.store'
import type { SsoLoginResponse } from '@/types/auth.types'
import { useI18n } from '@/composables/useI18n'

/**
 * FE-FR022-001 / FR-022 — password lifecycle:
 *   - Backend `password_expired` MUST surface localized safe copy plus a
 *     primary CTA pointing to the credential lifecycle (change password)
 *     flow. The technical `error_description` is dropped on the floor.
 */
const PASSWORD_EXPIRED_CTA_HREF = '/security'

/** Map common backend messages to locale keys without exposing raw backend copy. */
const ERROR_TRANSLATIONS: Record<string, string> = {
  'The supplied credentials are invalid.': 'auth.login.error_credentials',
  'These credentials do not match our records.': 'auth.login.error_credentials',
  'Too many login attempts. Please try again later.': 'auth.login.error_rate_limit_later',
  'The provided credentials are incorrect.': 'auth.login.error_credentials',
  'Your account has been disabled.': 'auth.login.error_disabled',
  'Invalid credentials.': 'auth.login.error_credentials',
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
  const { t } = useI18n()

  function translateError(message: string): string {
    const key = ERROR_TRANSLATIONS[message]
    return key ? t(key) : message
  }

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
      bannerError.value = t('auth.login.error_generic')
      return
    }

    if (response.next.type === 'redirect') {
      window.location.assign(response.next.redirect_uri)
      return
    }

    await navigateAfterLogin(readRedirectTarget())
  }

  function applyError(error: unknown): void {
    if (isValidationError(error) && error instanceof ApiError) {
      fieldErrors.value = error.violations.reduce<Record<string, string>>((acc, violation) => {
        acc[violation.field] = violation.message
        return acc
      }, {})
      bannerError.value = translateError(error.message)
      return
    }

    if (error instanceof ApiError) {
      applyStructuredLoginError(error)
      return
    }

    bannerError.value = t('auth.login.error_unexpected')
  }

  function applyStructuredLoginError(error: ApiError): void {
    if (error.status === 429) {
      startRetryCountdown(error.retryAfterSeconds ?? 60)
      return
    }

    // FE-FR022-001 — password_expired (BE returns 403 with code).
    if (error.status === 403 && error.code === 'password_expired') {
      bannerError.value = t('auth.login.password_expired')
      advisoryAction.value = {
        label: t('auth.login.change_password'),
        href: PASSWORD_EXPIRED_CTA_HREF,
      }
      return
    }

    // BE-FR020-001 — lost-factor recovery (admin reset MFA).
    if (error.status === 403 && error.code === 'mfa_reenrollment_required') {
      bannerError.value = t('auth.login.mfa_reenroll')
      advisoryAction.value = {
        label: t('portal.mfa.enable'),
        href: '/security/mfa',
      }
      return
    }

    if (error.status === 423 || error.status === 403) {
      bannerError.value = t('auth.login.error_locked')
      return
    }

    if (error.status === 401) {
      bannerError.value = t('auth.login.error_generic')
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
    bannerError.value =
      retryAfterSeconds.value > 0
        ? t('auth.login.error_rate_limit', { seconds: retryAfterSeconds.value })
        : null
  }

  function safeLoginErrorMessage(error: ApiError): string {
    if (error.status >= 500 || error.status === 0) return t('auth.login.error_unexpected')
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

  async function navigateAfterLogin(target: string): Promise<void> {
    if (isAdminFrontendTarget(target)) {
      window.location.assign(adminFrontendUrlForTarget(target, window.location.origin))
      return
    }

    await router.push(target)
  }

  return {
    form,
    pending,
    bannerError,
    fieldErrors,
    retryAfterSeconds,
    canSubmit,
    advisoryAction,
    submit,
  }
}
