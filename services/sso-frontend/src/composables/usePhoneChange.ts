import { ref, type Ref } from 'vue'
import { profileApi } from '@/services/profile.api'
import { presentSafeError, validationErrors } from '@/lib/api/safe-error-presenter'
import type { RequestPhoneChangePayload, ConfirmPhoneChangePayload } from '@/types/profile.types'
import { useI18n } from '@/composables/useI18n'

type PhoneChangeStep = 'request' | 'confirm'

interface PhoneChangeState {
  readonly step: Ref<PhoneChangeStep>
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  readonly error: Ref<string | null>
  readonly fieldErrors: Ref<Record<string, string>>
  readonly newPhone: Ref<string>
}

interface PhoneChangeActions {
  requestChange: (phone: string, password: string) => Promise<void>
  confirmChange: (otp: string) => Promise<void>
  reset: () => void
}

export type UsePhoneChangeReturn = PhoneChangeState & PhoneChangeActions

const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/u

export function usePhoneChange(): UsePhoneChangeReturn {
  const { t } = useI18n()
  const step = ref<PhoneChangeStep>('request')
  const pending = ref(false)
  const success = ref<string | null>(null)
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string>>({})
  const newPhone = ref('')

  async function requestChange(phone: string, password: string): Promise<void> {
    pending.value = true
    error.value = null
    success.value = null
    fieldErrors.value = {}
    newPhone.value = phone

    const clientErrors: Record<string, string> = {}
    if (!phone.trim()) clientErrors.new_phone = t('validation.phone_required')
    else if (!PHONE_REGEX.test(phone.trim()))
      clientErrors.new_phone = t('validation.phone_invalid')
    if (!password) clientErrors.current_password = t('validation.current_password_required')

    if (Object.keys(clientErrors).length > 0) {
      fieldErrors.value = clientErrors
      pending.value = false
      return
    }

    try {
      const payload: RequestPhoneChangePayload = { new_phone: phone, current_password: password }
      const result = await profileApi.requestPhoneChange(payload)
      success.value = result.message
      step.value = 'confirm'
    } catch (caught) {
      fieldErrors.value = validationErrors(caught)
      error.value = presentSafeError(caught, t('portal.phone_change.request_error')).message
    } finally {
      pending.value = false
    }
  }

  async function confirmChange(otp: string): Promise<void> {
    pending.value = true
    error.value = null
    success.value = null
    fieldErrors.value = {}

    if (!otp.trim()) {
      fieldErrors.value = { otp: t('portal.phone_change.otp_required') }
      pending.value = false
      return
    }

    try {
      const payload: ConfirmPhoneChangePayload = { otp }
      const result = await profileApi.confirmPhoneChange(payload)
      success.value = result.message
    } catch (caught) {
      fieldErrors.value = validationErrors(caught)
      error.value = presentSafeError(
        caught,
        t('portal.phone_change.confirm_error'),
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
    newPhone.value = ''
  }

  return {
    step,
    pending,
    success,
    error,
    fieldErrors,
    newPhone,
    requestChange,
    confirmChange,
    reset,
  }
}
