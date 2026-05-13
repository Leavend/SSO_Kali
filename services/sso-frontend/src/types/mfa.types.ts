/**
 * MFA Types — placeholder untuk UC-49, UC-50, UC-51.
 *
 * Status: ON-HOLD. Tipe ini didefinisikan sekarang supaya arsitektur
 * siap menerima MFA tanpa breaking change saat diimplementasi nanti.
 *
 * UC-49: Enroll TOTP authenticator.
 * UC-50: Verify TOTP challenge saat login.
 * UC-51: Recovery codes generation & usage.
 */

/** Supported MFA methods. */
export type MfaMethod = 'totp' | 'recovery_code'

/** Status enrollment MFA user. */
export type MfaEnrollmentStatus = {
  readonly enrolled: boolean
  readonly methods: readonly MfaMethod[]
  readonly totp_verified_at: string | null
  readonly recovery_codes_remaining: number
}

/** Response dari POST /api/mfa/totp/enroll. */
export type MfaTotpEnrollResponse = {
  readonly secret: string
  readonly qr_uri: string
  readonly provisioning_uri: string
}

/** Payload untuk POST /api/mfa/totp/verify. */
export type MfaTotpVerifyPayload = {
  readonly code: string
}

/** Response dari POST /api/mfa/totp/verify. */
export type MfaTotpVerifyResponse = {
  readonly verified: boolean
  readonly recovery_codes?: readonly string[]
}

/** MFA challenge yang dikirim backend saat login memerlukan 2FA. */
export type MfaChallenge = {
  readonly challenge_id: string
  readonly methods_available: readonly MfaMethod[]
  readonly expires_at: string
}

/** Payload untuk POST /api/mfa/challenge/verify. */
export type MfaChallengeVerifyPayload = {
  readonly challenge_id: string
  readonly method: MfaMethod
  readonly code: string
}

/** Response dari POST /api/mfa/challenge/verify. */
export type MfaChallengeVerifyResponse = {
  readonly authenticated: boolean
  readonly error?: string
}

/** Extended login response ketika MFA diperlukan. */
export type SsoLoginMfaRequired = {
  readonly authenticated: false
  readonly mfa_required: true
  readonly challenge: MfaChallenge
}
