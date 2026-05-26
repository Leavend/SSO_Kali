import { computed, reactive, ref, type ComputedRef, type Reactive, type Ref } from 'vue'
import { authApi } from '@/services/auth.api'
import {
  passwordResetStrengthItems,
  resetConfirmReady,
  usePasswordActionState,
  validateResetForm,
  type MutablePasswordResetConfirmPayload,
  type MutablePasswordResetRequestPayload,
  type PasswordFieldErrors,
} from './passwordLifecycle.shared'
export { useChangePassword, type UseChangePasswordReturn } from './useChangePassword'
export type { PasswordFieldErrors } from './passwordLifecycle.shared'

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
    await state.run(
      async () => {
        const result = await authApi.requestPasswordReset({ email: form.email.trim() })
        state.success.value = result.message
      },
      fieldErrors,
      'Gagal meminta reset password. Coba lagi.',
    )
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

export function usePasswordResetConfirm(
  initialToken: string | null,
): UsePasswordResetConfirmReturn {
  const form = reactive<MutablePasswordResetConfirmPayload>({
    email: '',
    token: initialToken ?? '',
    password: '',
    password_confirmation: '',
  })
  const state = usePasswordActionState()
  const fieldErrors = ref<PasswordFieldErrors>({})
  const strengthItems = computed<readonly string[]>(() => passwordResetStrengthItems(form))
  const canSubmit = computed<boolean>(() =>
    resetConfirmReady(form, state.pending.value, strengthItems.value),
  )

  async function submit(): Promise<void> {
    fieldErrors.value = validateResetForm(form)
    if (Object.keys(fieldErrors.value).length > 0) return
    await state.run(
      async () => {
        const result = await authApi.confirmPasswordReset({ ...form, email: form.email.trim() })
        state.success.value = result.sessions_revoked
          ? `${result.message} Masuk ulang dengan password baru.`
          : result.message
        form.password = ''
        form.password_confirmation = ''
      },
      fieldErrors,
      'Gagal mereset password. Coba lagi.',
    )
  }

  return { form, ...state.refs, fieldErrors, strengthItems, canSubmit, submit }
}
