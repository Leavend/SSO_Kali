/**
 * useMfaEnrollment — placeholder composable UC-49 (Enroll TOTP).
 *
 * Status: ON-HOLD. Implementasi akan dilakukan setelah backend
 * endpoint `/api/mfa/totp/enroll` dan `/api/mfa/totp/verify` ready.
 *
 * Composable ini akan mengemas:
 *   - Generate QR code URI dari backend.
 *   - Verify 6-digit TOTP code.
 *   - Store recovery codes.
 *   - Error handling (invalid code, expired enrollment).
 */

import { ref } from 'vue'
import type {
  MfaEnrollmentStatus,
  MfaTotpEnrollResponse,
  MfaTotpVerifyPayload,
  MfaTotpVerifyResponse,
} from '@/types/mfa.types'

export function useMfaEnrollment() {
  const status = ref<MfaEnrollmentStatus | null>(null)
  const enrollData = ref<MfaTotpEnrollResponse | null>(null)
  const recoveryCodes = ref<readonly string[]>([])
  const pending = ref<boolean>(false)
  const error = ref<string | null>(null)

  // TODO: UC-49 — Implement when backend ready.
  async function fetchStatus(): Promise<void> {
    void status.value // placeholder
    throw new Error('[MFA] Not implemented: fetchStatus. Waiting for backend endpoint.')
  }

  // TODO: UC-49 — Implement when backend ready.
  async function startEnrollment(): Promise<void> {
    void enrollData.value // placeholder
    throw new Error('[MFA] Not implemented: startEnrollment. Waiting for backend endpoint.')
  }

  // TODO: UC-49 — Implement when backend ready.
  async function verifyTotp(_payload: MfaTotpVerifyPayload): Promise<MfaTotpVerifyResponse> {
    void pending.value
    void error.value
    throw new Error('[MFA] Not implemented: verifyTotp. Waiting for backend endpoint.')
  }

  return {
    status,
    enrollData,
    recoveryCodes,
    pending,
    error,
    fetchStatus,
    startEnrollment,
    verifyTotp,
  }
}
