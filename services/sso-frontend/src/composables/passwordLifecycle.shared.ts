import { ref, type Ref } from 'vue'
import { presentSafeError, validationErrors } from '@/lib/api/safe-error-presenter'

export type PasswordFieldErrors = Record<string, string>

export type MutableChangePasswordPayload = {
  current_password: string
  new_password: string
  new_password_confirmation: string
}

export type MutablePasswordResetRequestPayload = { email: string }

export type MutablePasswordResetConfirmPayload = {
  email: string
  token: string
  password: string
  password_confirmation: string
}

export type PasswordActionState = {
  readonly refs: {
    readonly pending: Ref<boolean>
    readonly success: Ref<string | null>
    readonly error: Ref<string | null>
  }
  readonly pending: Ref<boolean>
  readonly success: Ref<string | null>
  run: (fn: () => Promise<void>, fields: Ref<PasswordFieldErrors>, fallback: string) => Promise<void>
  reset: () => void
}

export function usePasswordActionState(): PasswordActionState {
  const pending = ref(false)
  const success = ref<string | null>(null)
  const error = ref<string | null>(null)

  async function run(
    fn: () => Promise<void>,
    fields: Ref<PasswordFieldErrors>,
    fallback: string,
  ): Promise<void> {
    pending.value = true
    error.value = null
    success.value = null
    fields.value = {}
    try {
      await fn()
    } catch (caught) {
      fields.value = validationErrors(caught)
      error.value = presentSafeError(caught, fallback).message
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    pending.value = false
    success.value = null
    error.value = null
  }

  return { refs: { pending, success, error }, pending, success, run, reset }
}

export function requiredChangeFieldsFilled(form: MutableChangePasswordPayload): boolean {
  return form.current_password.length > 0 && form.new_password.length > 0 && form.new_password_confirmation.length > 0
}

export function clearChangeForm(form: MutableChangePasswordPayload): void {
  form.current_password = ''
  form.new_password = ''
  form.new_password_confirmation = ''
}

export function resetConfirmReady(
  form: MutablePasswordResetConfirmPayload,
  pending: boolean,
  strengthItems: readonly string[],
): boolean {
  return !pending && form.email.trim().length > 0 && form.token.length > 0 && strengthItems.length === 0
}
