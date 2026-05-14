/**
 * MFA API — endpoints untuk manajemen MFA `/api/mfa/*`.
 *
 * Sumber kontrak: services/sso-backend/routes/auth.php
 */

import { apiClient } from '@/lib/api/api-client'
import type {
  MfaEnrollmentStatus,
  MfaTotpEnrollResponse,
  MfaTotpVerifyPayload,
  MfaTotpVerifyResponse,
} from '@/types/mfa.types'

export type MfaRemovePayload = {
  readonly password: string
}

export type MfaRemoveResponse = {
  readonly removed: boolean
  readonly message: string
}

export type MfaRegenerateCodesPayload = {
  readonly password: string
}

export type MfaRegenerateCodesResponse = {
  readonly regenerated: boolean
  readonly recovery_codes: readonly string[]
}

export const mfaApi = {
  getStatus(): Promise<MfaEnrollmentStatus> {
    return apiClient.get<MfaEnrollmentStatus>('/api/mfa/status')
  },

  startEnrollment(): Promise<MfaTotpEnrollResponse> {
    return apiClient.post<MfaTotpEnrollResponse>('/api/mfa/totp/enroll')
  },

  verifyTotp(payload: MfaTotpVerifyPayload): Promise<MfaTotpVerifyResponse> {
    return apiClient.post<MfaTotpVerifyResponse>('/api/mfa/totp/verify', payload)
  },

  remove(payload: MfaRemovePayload): Promise<MfaRemoveResponse> {
    return apiClient.delete<MfaRemoveResponse>('/api/mfa/totp')
  },

  regenerateRecoveryCodes(payload: MfaRegenerateCodesPayload): Promise<MfaRegenerateCodesResponse> {
    return apiClient.post<MfaRegenerateCodesResponse>('/api/mfa/recovery-codes/regenerate', payload)
  },
}
