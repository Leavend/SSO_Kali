import { computed, reactive, ref, type ComputedRef, type Reactive, type Ref } from 'vue'
import { profileApi } from '@/services/profile.api'
import {
  passwordRequirementStatuses,
  passwordStrengthHints,
  passwordStrengthSummary,
  type PasswordRequirementStatus,
  type PasswordStrengthSummary,
} from '@/lib/auth/password-policy'
import {
  clearChangeForm,
  requiredChangeFieldsFilled,
  usePasswordActionState,
  validateChangeForm,
  type MutableChangePasswordPayload,
  type PasswordFieldErrors,
} from './passwordLifecycle.shared'
import type { ChangePasswordPayload } from '@/types/profile.types'

interface ChangePasswordState {
  readonly form: Reactive<MutableChangePasswordPayload>
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  readonly error: Ref<string | null>
  readonly fieldErrors: Ref<PasswordFieldErrors>
  readonly strengthItems: ComputedRef<readonly string[]>
  readonly strengthRequirements: ComputedRef<readonly PasswordRequirementStatus[]>
  readonly strengthSummary: ComputedRef<PasswordStrengthSummary>
  readonly canSubmit: ComputedRef<boolean>
}

interface ChangePasswordActions {
  updateField: (field: keyof ChangePasswordPayload, value: string) => void
  submit: () => Promise<void>
  reset: () => void
}

export type UseChangePasswordReturn = ChangePasswordState & ChangePasswordActions

export function useChangePassword(): UseChangePasswordReturn {
  const form = reactive<MutableChangePasswordPayload>({
    current_password: '',
    new_password: '',
    new_password_confirmation: '',
  })
  const state = usePasswordActionState()
  const fieldErrors = ref<PasswordFieldErrors>({})
  const strengthItems = computed<readonly string[]>(() => passwordStrengthHints(form.new_password))
  const strengthRequirements = computed<readonly PasswordRequirementStatus[]>(() =>
    passwordRequirementStatuses(form.new_password),
  )
  const strengthSummary = computed<PasswordStrengthSummary>(() =>
    passwordStrengthSummary(form.new_password),
  )
  const canSubmit = computed<boolean>(
    () =>
      !state.pending.value && requiredChangeFieldsFilled(form) && strengthItems.value.length === 0,
  )

  function updateField(field: keyof ChangePasswordPayload, value: string): void {
    form[field] = value
  }

  async function submit(): Promise<void> {
    fieldErrors.value = validateChangeForm(form)
    if (Object.keys(fieldErrors.value).length > 0) return
    await state.run(
      async () => {
        const result = await profileApi.changePassword(form)
        state.success.value = result.other_sessions_revoked
          ? `${result.message} Semua sesi lain otomatis keluar.`
          : result.message
        clearChangeForm(form)
      },
      fieldErrors,
      'Gagal mengubah password. Coba lagi.',
    )
  }

  function reset(): void {
    clearChangeForm(form)
    fieldErrors.value = {}
    state.reset()
  }

  return {
    form,
    ...state.refs,
    fieldErrors,
    strengthItems,
    strengthRequirements,
    strengthSummary,
    canSubmit,
    updateField,
    submit,
    reset,
  }
}
