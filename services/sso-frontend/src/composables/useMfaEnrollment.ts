/**
 * useMfaEnrollment — FR-018 / FR-020 portal MFA lifecycle.
 *
 * Handles status, TOTP enrollment, verification, one-time recovery codes,
 * regeneration, and removal with safe localized errors.
 */

import { computed, ref } from 'vue'
import { ApiError } from '@/lib/api/api-error'
import { mfaApi } from '@/services/mfa.api'
import type {
  MfaEnrollmentStatus,
  MfaTotpEnrollResponse,
  MfaTotpVerifyPayload,
  MfaTotpVerifyResponse,
} from '@/types/mfa.types'

const SAFE_MFA_ERROR = 'Aksi MFA gagal diproses. Periksa data lalu coba lagi.'
const INVALID_CODE_ERROR = 'Kode verifikasi tidak valid atau sudah kedaluwarsa.'
const PASSWORD_CONFIRMATION_ERROR = 'Password tidak valid. Coba lagi.'

export function useMfaEnrollment() {
  const status = ref<MfaEnrollmentStatus | null>(null)
  const enrollData = ref<MfaTotpEnrollResponse | null>(null)
  const recoveryCodes = ref<readonly string[]>([])
  const pending = ref<boolean>(false)
  const error = ref<string | null>(null)
  const step = ref<'idle' | 'scanning' | 'verifying' | 'recovery' | 'complete'>('idle')

  const isEnrolled = computed<boolean>(() => status.value?.enrolled ?? false)
  const recoveryCodesRemaining = computed<number>(
    () => status.value?.recovery_codes_remaining ?? 0,
  )

  async function fetchStatus(): Promise<void> {
    await run(async () => {
      status.value = await mfaApi.getStatus()
      step.value = 'idle'
    })
  }

  async function startEnrollment(): Promise<void> {
    await run(async () => {
      enrollData.value = await mfaApi.startEnrollment()
      step.value = 'scanning'
    })
  }

  async function verifyTotp(payload: MfaTotpVerifyPayload): Promise<MfaTotpVerifyResponse> {
    let response: MfaTotpVerifyResponse | null = null
    await run(async () => {
      response = await mfaApi.verifyTotp(payload)
      recoveryCodes.value = response.recovery_codes ?? []
      await refreshStatus()
      step.value = recoveryCodes.value.length > 0 ? 'recovery' : 'complete'
    })

    if (response === null) throw new Error('MFA verification failed.')
    return response
  }

  async function verifyCode(code: string): Promise<void> {
    await verifyTotp({ code })
  }

  async function remove(password: string): Promise<boolean> {
    return runBoolean(async () => {
      await mfaApi.remove({ password })
      await fetchStatus()
      step.value = 'idle'
    })
  }

  async function regenerateCodes(password: string): Promise<boolean> {
    return runBoolean(async () => {
      const response = await mfaApi.regenerateRecoveryCodes({ password })
      recoveryCodes.value = response.recovery_codes
      await refreshStatus()
      step.value = 'recovery'
    })
  }

  function completeSetup(): void {
    recoveryCodes.value = []
    step.value = 'complete'
  }

  async function refreshStatus(): Promise<void> {
    status.value = await mfaApi.getStatus()
  }

  async function run(callback: () => Promise<void>): Promise<void> {
    pending.value = true
    error.value = null
    try {
      await callback()
    } catch (exception) {
      error.value = safeMfaErrorMessage(exception)
      throw exception
    } finally {
      pending.value = false
    }
  }

  async function runBoolean(callback: () => Promise<void>): Promise<boolean> {
    try {
      await run(callback)
      return true
    } catch {
      return false
    }
  }

  function safeMfaErrorMessage(exception: unknown): string {
    if (!(exception instanceof ApiError)) return SAFE_MFA_ERROR
    if (exception.status === 422 && exception.violations.length > 0) return INVALID_CODE_ERROR
    if (exception.status === 401 || exception.status === 403 || exception.status === 422) {
      return PASSWORD_CONFIRMATION_ERROR
    }
    return SAFE_MFA_ERROR
  }

  return {
    status,
    enrollData,
    recoveryCodes,
    pending,
    error,
    step,
    isEnrolled,
    recoveryCodesRemaining,
    fetchStatus,
    startEnrollment,
    verifyTotp,
    verifyCode,
    remove,
    regenerateCodes,
    completeSetup,
  }
}
