import { ref, type Ref } from 'vue'
import { profileApi } from '@/services/profile.api'
import { presentSafeError, validationErrors } from '@/lib/api/safe-error-presenter'
import type { RequestEmailChangePayload, ConfirmEmailChangePayload } from '@/types/profile.types'
import { useI18n } from '@/composables/useI18n'

type EmailChangeStep = 'request' | 'confirm'

interface EmailChangeState {
  readonly step: Ref<EmailChangeStep>
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  readonly error: Ref<string | null>
  readonly fieldErrors: Ref<Record<string, string>>
  readonly newEmail: Ref<string>
}

interface EmailChangeActions {
  requestChange: (email: string, password: string) => Promise<void>
  confirmChange: (token: string) => Promise<void>
  reset: () => void
}

export type UseEmailChangeReturn = EmailChangeState & EmailChangeActions

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function useEmailChange(): UseEmailChangeReturn {
  const { t } = useI18n()
  const step = ref<EmailChangeStep>('request')
  const pending = ref(false)
  const success = ref<string | null>(null)
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string>>({})
  const newEmail = ref('')

  async function requestChange(email: string, password: string): Promise<void> {
    pending.value = true
    error.value = null
    success.value = null
    fieldErrors.value = {}
    newEmail.value = email

    const clientErrors: Record<string, string> = {}
    if (!email.trim()) clientErrors.new_email = t('validation.email_required')
    else if (!EMAIL_REGEX.test(email.trim()))
      clientErrors.new_email = t('validation.email_invalid')
    if (!password) clientErrors.current_password = t('validation.current_password_required')

    if (Object.keys(clientErrors).length > 0) {
      fieldErrors.value = clientErrors
      pending.value = false
      return
    }

    try {
      const payload: RequestEmailChangePayload = { new_email: email, current_password: password }
      const result = await profileApi.requestEmailChange(payload)
      success.value = result.message
      step.value = 'confirm'
    } catch (caught) {
      fieldErrors.value = validationErrors(caught)
      error.value = presentSafeError(caught, t('portal.email_change.request_error')).message
    } finally {
      pending.value = false
    }
  }

  async function confirmChange(token: string): Promise<void> {
    pending.value = true
    error.value = null
    success.value = null
    fieldErrors.value = {}

    if (!token.trim()) {
      fieldErrors.value = { token: t('portal.email_change.token_required') }
      pending.value = false
      return
    }

    try {
      const payload: ConfirmEmailChangePayload = { token }
      const result = await profileApi.confirmEmailChange(payload)
      success.value = result.message
    } catch (caught) {
      fieldErrors.value = validationErrors(caught)
      error.value = presentSafeError(
        caught,
        t('portal.email_change.confirm_error'),
      ).message
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    step.value = 'request'
    pending.value = false
    success.value = null
    error.value = null
    fieldErrors.value = {}
    newEmail.value = ''
  }

  return {
    step,
    pending,
    success,
    error,
    fieldErrors,
    newEmail,
    requestChange,
    confirmChange,
    reset,
  }
}
