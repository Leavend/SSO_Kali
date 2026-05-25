/**
 * MFA API — endpoints untuk manajemen MFA `/api/mfa/*`.
 *
 * Sumber kontrak: services/sso-backend/routes/auth.php
 */

import { apiClient } from '@/lib/api/api-client'
import { isPortalPreviewBypassEnabled, previewMfaStatus } from '@/lib/portal-preview'
import type {
  MfaEnrollmentStatus,
  MfaChallengeVerifyPayload,
  MfaChallengeVerifyResponse,
  MfaTotpEnrollResponse,
  MfaTotpVerifyPayload,
  MfaTotpVerifyResponse,
} from '@/types/mfa.types'

export type { MfaChallengeVerifyResponse } from '@/types/mfa.types'

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
    if (isPortalPreviewBypassEnabled()) return Promise.resolve(previewMfaStatus)
    return apiClient.get<MfaEnrollmentStatus>('/api/mfa/status')
  },

  startEnrollment(): Promise<MfaTotpEnrollResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        secret: 'PREVIEWTOTPSECRET',
        qr_uri:
          'otpauth://totp/Dev-SSO:preview.user@dev-sso.local?secret=PREVIEWTOTPSECRET&issuer=Dev-SSO',
        provisioning_uri:
          'otpauth://totp/Dev-SSO:preview.user@dev-sso.local?secret=PREVIEWTOTPSECRET&issuer=Dev-SSO',
      })
    }
    return apiClient.post<MfaTotpEnrollResponse>('/api/mfa/totp/enroll')
  },

  verifyTotp(payload: MfaTotpVerifyPayload): Promise<MfaTotpVerifyResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        verified: payload.code.length >= 6,
        recovery_codes: ['ABCD-EFGH', 'IJKL-MNOP', 'QRST-UVWX'],
      })
    }
    return apiClient.post<MfaTotpVerifyResponse>('/api/mfa/totp/verify', payload)
  },

  verifyChallenge(payload: MfaChallengeVerifyPayload): Promise<MfaChallengeVerifyResponse> {
    return apiClient.post<MfaChallengeVerifyResponse>('/api/mfa/challenge/verify', payload)
  },

  remove(payload: MfaRemovePayload): Promise<MfaRemoveResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        removed: payload.password.length > 0,
        message: 'MFA preview dinonaktifkan.',
      })
    }
    return apiClient.delete<MfaRemoveResponse>('/api/mfa/totp', { body: payload })
  },

  regenerateRecoveryCodes(payload: MfaRegenerateCodesPayload): Promise<MfaRegenerateCodesResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        regenerated: payload.password.length > 0,
        recovery_codes: ['NEW1-CODE', 'NEW2-CODE', 'NEW3-CODE'],
      })
    }
    return apiClient.post<MfaRegenerateCodesResponse>('/api/mfa/recovery-codes/regenerate', payload)
  },
}
