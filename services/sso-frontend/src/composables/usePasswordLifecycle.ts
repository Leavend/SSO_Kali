import { computed, reactive, ref, type ComputedRef, type Reactive, type Ref } from 'vue'
import { authApi } from '@/services/auth.api'
import { profileApi } from '@/services/profile.api'
import { passwordStrengthHints, validatePasswordFields } from '@/lib/auth/password-policy'
import {
  clearChangeForm,
  requiredChangeFieldsFilled,
  resetConfirmReady,
  usePasswordActionState,
  type MutableChangePasswordPayload,
  type MutablePasswordResetConfirmPayload,
  type MutablePasswordResetRequestPayload,
  type PasswordFieldErrors,
} from './passwordLifecycle.shared'
import type { ChangePasswordPayload } from '@/types/profile.types'

export type { PasswordFieldErrors } from './passwordLifecycle.shared'

export type UseChangePasswordReturn = {
  readonly form: Reactive<MutableChangePasswordPayload>
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  readonly error: Ref<string | null>
  readonly fieldErrors: Ref<PasswordFieldErrors>
  readonly strengthItems: ComputedRef<readonly string[]>
  readonly canSubmit: ComputedRef<boolean>
  updateField: (field: keyof ChangePasswordPayload, value: string) => void
  submit: () => Promise<void>
  reset: () => void
}

export function useChangePassword(): UseChangePasswordReturn {
  const form = reactive<MutableChangePasswordPayload>({
    current_password: '',
    new_password: '',
    new_password_confirmation: '',
  })
  const state = usePasswordActionState()
  const fieldErrors = ref<PasswordFieldErrors>({})
  const strengthItems = computed<readonly string[]>(() => passwordStrengthHints(form.new_password))
  const canSubmit = computed<boolean>(() => !state.pending.value && requiredChangeFieldsFilled(form) && strengthItems.value.length === 0)

  function updateField(field: keyof ChangePasswordPayload, value: string): void {
    form[field] = value
  }

  async function submit(): Promise<void> {
    fieldErrors.value = validateChangeForm(form)
    if (Object.keys(fieldErrors.value).length > 0) return
    await state.run(async () => {
      const result = await profileApi.changePassword(form)
      state.success.value = result.other_sessions_revoked
        ? `${result.message} Semua sesi lain telah dicabut.`
        : result.message
      clearChangeForm(form)
    }, fieldErrors, 'Gagal mengubah password. Coba lagi.')
  }

  function reset(): void {
    clearChangeForm(form)
    fieldErrors.value = {}
    state.reset()
  }

  return { form, ...state.refs, fieldErrors, strengthItems, canSubmit, updateField, submit, reset }
}

export type UsePasswordResetRequestReturn = {
  readonly form: Reactive<MutablePasswordResetRequestPayload>
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  readonly error: Ref<string | null>
  readonly fieldErrors: Ref<PasswordFieldErrors>
  readonly canSubmit: ComputedRef<boolean>
  submit: () => Promise<void>
}

export function usePasswordResetRequest(): UsePasswordResetRequestReturn {
  const form = reactive<MutablePasswordResetRequestPayload>({ email: '' })
  const state = usePasswordActionState()
  const fieldErrors = ref<PasswordFieldErrors>({})
  const canSubmit = computed<boolean>(() => !state.pending.value && form.email.trim().length > 0)

  async function submit(): Promise<void> {
    if (!canSubmit.value) return
    await state.run(async () => {
      const result = await authApi.requestPasswordReset({ email: form.email.trim() })
      state.success.value = result.message
    }, fieldErrors, 'Gagal meminta reset password. Coba lagi.')
  }

  return { form, ...state.refs, fieldErrors, canSubmit, submit }
}

export type UsePasswordResetConfirmReturn = {
  readonly form: Reactive<MutablePasswordResetConfirmPayload>
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  readonly error: Ref<string | null>
  readonly fieldErrors: Ref<PasswordFieldErrors>
  readonly strengthItems: ComputedRef<readonly string[]>
  readonly canSubmit: ComputedRef<boolean>
  submit: () => Promise<void>
}

export function usePasswordResetConfirm(initialToken: string | null): UsePasswordResetConfirmReturn {
  const form = reactive<MutablePasswordResetConfirmPayload>({
    email: '',
    token: initialToken ?? '',
    password: '',
    password_confirmation: '',
  })
  const state = usePasswordActionState()
  const fieldErrors = ref<PasswordFieldErrors>({})
  const strengthItems = computed<readonly string[]>(() => passwordStrengthHints(form.password))
  const canSubmit = computed<boolean>(() => resetConfirmReady(form, state.pending.value, strengthItems.value))

  async function submit(): Promise<void> {
    fieldErrors.value = validateResetForm(form)
    if (Object.keys(fieldErrors.value).length > 0) return
    await state.run(async () => {
      const result = await authApi.confirmPasswordReset({ ...form, email: form.email.trim() })
      state.success.value = result.sessions_revoked
        ? `${result.message} Masuk ulang dengan password baru.`
        : result.message
      form.password = ''
      form.password_confirmation = ''
    }, fieldErrors, 'Gagal mereset password. Coba lagi.')
  }

  return { form, ...state.refs, fieldErrors, strengthItems, canSubmit, submit }
}

function validateChangeForm(form: MutableChangePasswordPayload): PasswordFieldErrors {
  const errors = validatePasswordFields(form.new_password, form.new_password_confirmation, 'new_password')
  if (form.current_password.length === 0) errors['current_password'] = 'Password saat ini wajib diisi.'
  return errors
}

function validateResetForm(form: MutablePasswordResetConfirmPayload): PasswordFieldErrors {
  const errors = validatePasswordFields(form.password, form.password_confirmation, 'password')
  if (form.email.trim().length === 0) errors['email'] = 'Email wajib diisi.'
  if (form.token.length === 0) errors['token'] = 'Token reset wajib diisi.'
  return errors
}


