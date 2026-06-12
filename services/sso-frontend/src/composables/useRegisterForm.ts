/**
 * useRegisterForm — encapsulates state, validation, and submit flow for
 * the multi-step registration page. Pulled out of RegisterPage.vue so the
 * page can stay below the 300-line hard limit (standart-quality-code §2.1)
 * and so the registration flow becomes unit-testable without DOM mounting.
 *
 * Behaviour parity (frozen):
 *  - Same FR-014 contract: POST `/api/auth/register` with name/email/password
 *    and password_confirmation.
 *  - Same FR-015 + FR-062 password policy hints (`passwordStrengthHints`).
 *  - Same 422 violation routing: re-route to the originating step so inline
 *    error renders next to the offending field.
 *  - Same `presentSafeError` mapping for unknown ApiError shapes — never
 *    leaks raw backend strings (TDD-standart-prod §13.3).
 *  - Same 3-second redirect timer to /auth/login on success.
 */

import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiClient } from '@/lib/api/api-client'
import { ApiError, isValidationError } from '@/lib/api/api-error'
import { presentSafeError } from '@/lib/api/safe-error-presenter'
import { passwordStrengthHints } from '@/lib/auth/password-policy'
import { translateRegisterViolation } from '@/lib/auth/register-violations'
import { useAuthSteps, type UseAuthStepsApi } from '@/composables/useAuthSteps'
import { useRateLimitNotice } from '@/composables/useRateLimitNotice'
import { useI18n } from '@/composables/useI18n'

export type RegisterStepId = 'email' | 'password' | 'confirm'

export interface RegisterForm {
  name: string
  email: string
  password: string
  password_confirmation: string
}

export interface UseRegisterFormReturn {
  form: RegisterForm
  pending: Ref<boolean>
  bannerError: Ref<string | null>
  bannerSuccess: Ref<string | null>
  fieldErrors: Ref<Record<string, string>>
  passwordHints: ComputedRef<readonly string[]>
  isEmailFormatted: ComputedRef<boolean>
  isPasswordPolicyOk: ComputedRef<boolean>
  isConfirmFilled: ComputedRef<boolean>
  steps: UseAuthStepsApi<RegisterStepId>
  headline: ComputedRef<string>
  tagline: ComputedRef<string>
  onSubmit: (event: Event) => void
  onStepEnter: (event: KeyboardEvent) => void
}

const REDIRECT_DELAY_MS = 3000

export function useRegisterForm(): UseRegisterFormReturn {
  const router = useRouter()
  const rateLimitNotice = useRateLimitNotice()
  const { t } = useI18n()

  const form = reactive<RegisterForm>({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
  })

  const pending = ref<boolean>(false)
  const bannerError = ref<string | null>(null)
  const bannerSuccess = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string>>({})

  const passwordHints = computed<readonly string[]>(() => passwordStrengthHints(form.password))
  const isEmailFormatted = computed<boolean>(() => /\S+@\S+\.\S+/.test(form.email.trim()))
  const isPasswordPolicyOk = computed<boolean>(() => passwordHints.value.length === 0)
  const isConfirmFilled = computed<boolean>(
    () => form.password_confirmation === form.password && form.name.trim().length > 0,
  )

  const steps = useAuthSteps<RegisterStepId>([
    { id: 'email', canAdvance: () => isEmailFormatted.value, focusId: 'register-email' },
    {
      id: 'password',
      canAdvance: () => isPasswordPolicyOk.value,
      focusId: 'register-password',
      onLeave: () => {
        form.password = ''
        form.password_confirmation = ''
      },
    },
    {
      id: 'confirm',
      canAdvance: () => isConfirmFilled.value && !pending.value,
      focusId: 'register-password-confirm',
      onLeave: () => {
        form.password_confirmation = ''
      },
    },
  ])

  const headline = computed<string>(() => t(`auth.register.headline_${steps.current.value}`))
  const tagline = computed<string>(() => t(`auth.register.tagline_${steps.current.value}`))

  function validateFinalStep(): boolean {
    const errors: Record<string, string> = {}
    if (form.name.trim().length === 0) errors.name = t('auth.register.name_required')
    if (!isEmailFormatted.value) errors.email = t('auth.register.email_required')
    if (passwordHints.value.length > 0) {
      errors.password =
        t('auth.register.password_policy_error', { items: passwordHints.value.join(', ') })
    }
    if (form.password !== form.password_confirmation) {
      errors.password_confirmation = t('auth.register.password_mismatch')
    }
    fieldErrors.value = errors
    return Object.keys(errors).length === 0
  }

  function resetForm(): void {
    form.name = ''
    form.email = ''
    form.password = ''
    form.password_confirmation = ''
  }

  function handleValidationError(error: ApiError): void {
    fieldErrors.value = error.violations.reduce<Record<string, string>>((acc, violation) => {
      acc[violation.field] = translateRegisterViolation(violation.message)
      return acc
    }, {})
    bannerError.value = presentSafeError(error, t('auth.register.invalid_data')).message
    if (fieldErrors.value.email) steps.goTo('email')
    else if (fieldErrors.value.password) steps.goTo('password')
  }

  function handleSubmitError(error: unknown): void {
    if (isValidationError(error) && error instanceof ApiError) {
      handleValidationError(error)
      return
    }
    if (error instanceof ApiError) {
      const rateLimit = rateLimitNotice.fromError(error)
      if (rateLimit) {
        bannerError.value = rateLimit.message
        return
      }
      bannerError.value = presentSafeError(
        error,
        t('auth.register.failure'),
      ).message
      return
    }
    bannerError.value = t('auth.register.failure')
  }

  async function submit(): Promise<void> {
    if (!validateFinalStep()) return
    pending.value = true
    bannerError.value = null
    bannerSuccess.value = null
    try {
      await apiClient.post('/api/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        password_confirmation: form.password_confirmation,
      })
      bannerSuccess.value = t('auth.register.success')
      resetForm()
      setTimeout(() => {
        void router.push({ name: 'auth.login' })
      }, REDIRECT_DELAY_MS)
    } catch (error) {
      handleSubmitError(error)
    } finally {
      pending.value = false
    }
  }

  function onSubmit(event: Event): void {
    event.preventDefault()
    if (steps.current.value !== 'confirm') {
      steps.next()
      return
    }
    void submit()
  }

  function onStepEnter(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    steps.next()
  }

  return {
    form,
    pending,
    bannerError,
    bannerSuccess,
    fieldErrors,
    passwordHints,
    isEmailFormatted,
    isPasswordPolicyOk,
    isConfirmFilled,
    steps,
    headline,
    tagline,
    onSubmit,
    onStepEnter,
  }
}
