/**
 * useMfaEnrollment — composable UC-49 (Enroll TOTP).
 *
 * Mengemas seluruh flow MFA enrollment:
 *   - Fetch status enrollment saat ini.
 *   - Generate QR code URI dari backend.
 *   - Verify 6-digit TOTP code.
 *   - Store recovery codes.
 *   - Remove TOTP credential.
 *   - Regenerate recovery codes.
 *   - Error handling (invalid code, expired enrollment).
 */

import { computed, ref } from 'vue'
import { mfaApi } from '@/services/mfa.api'
import type {
  MfaEnrollmentStatus,
  MfaTotpEnrollResponse,
  MfaTotpVerifyResponse,
} from '@/types/mfa.types'

export type MfaEnrollmentStep = 'idle' | 'scanning' | 'verifying' | 'recovery' | 'complete'

export function useMfaEnrollment() {
  const status = ref<MfaEnrollmentStatus | null>(null)
  const enrollData = ref<MfaTotpEnrollResponse | null>(null)
  const recoveryCodes = ref<readonly string[]>([])
  const pending = ref<boolean>(false)
  const error = ref<string | null>(null)
  const step = ref<MfaEnrollmentStep>('idle')

  const isEnrolled = computed<boolean>(() => status.value?.enrolled ?? false)
  const recoveryCodesRemaining = computed<number>(() => status.value?.recovery_codes_remaining ?? 0)

  async function fetchStatus(): Promise<void> {
    pending.value = true
    error.value = null

    try {
      status.value = await mfaApi.getStatus()
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Gagal memuat status MFA.')
    } finally {
      pending.value = false
    }
  }

  async function startEnrollment(): Promise<void> {
    pending.value = true
    error.value = null

    try {
      enrollData.value = await mfaApi.startEnrollment()
      step.value = 'scanning'
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Gagal memulai pendaftaran MFA.')
    } finally {
      pending.value = false
    }
  }

  async function verifyCode(code: string): Promise<MfaTotpVerifyResponse | null> {
    pending.value = true
    error.value = null

    try {
      const result = await mfaApi.verifyTotp({ code })

      if (result.verified) {
        recoveryCodes.value = result.recovery_codes ?? []
        step.value = 'recovery'
        await fetchStatus()
      }

      return result
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Kode verifikasi tidak valid.')
      return null
    } finally {
      pending.value = false
    }
  }

  async function regenerateCodes(password: string): Promise<boolean> {
    pending.value = true
    error.value = null

    try {
      const result = await mfaApi.regenerateRecoveryCodes({ password })

      if (result.regenerated) {
        recoveryCodes.value = result.recovery_codes
        step.value = 'recovery'
        await fetchStatus()
      }

      return result.regenerated
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Gagal meregenerasi recovery codes.')
      return false
    } finally {
      pending.value = false
    }
  }

  async function remove(password: string): Promise<boolean> {
    pending.value = true
    error.value = null

    try {
      await mfaApi.remove({ password })
      status.value = null
      enrollData.value = null
      recoveryCodes.value = []
      step.value = 'idle'
      await fetchStatus()
      return true
    } catch (err: unknown) {
      error.value = extractErrorMessage(err, 'Gagal menonaktifkan MFA.')
      return false
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    enrollData.value = null
    recoveryCodes.value = []
    error.value = null
    step.value = 'idle'
  }

  function completeSetup(): void {
    step.value = 'complete'
    recoveryCodes.value = []
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
    verifyCode,
    regenerateCodes,
    remove,
    reset,
    completeSetup,
  }
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const apiErr = err as { body?: { message?: string }; message?: string } | undefined
  return apiErr?.body?.message ?? apiErr?.message ?? fallback
}

