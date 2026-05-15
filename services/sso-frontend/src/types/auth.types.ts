/**
 * Auth domain types — kontrak dengan `services/sso-backend` endpoint `/api/auth/*`.
 */

export type SsoUser = {
  readonly id: number
  readonly subject_id: string
  readonly email: string
  readonly display_name: string
  readonly roles: readonly string[]
}

export type SsoSession = {
  readonly expires_at: string
}

export type SsoLoginNext = {
  readonly type: 'session' | 'continue_authorize'
  readonly auth_request_id: string | null
}

export type SsoLoginSuccess = {
  readonly authenticated: true
  readonly user: SsoUser
  readonly session: SsoSession
  readonly next: SsoLoginNext
}

export type SsoLoginFailure = {
  readonly authenticated: false
  readonly error: string
  readonly message: string
}

/** FR-019: MFA challenge response when user has TOTP enrolled. */
export type SsoLoginMfaRequired = {
  readonly authenticated: false
  readonly mfa_required: true
  readonly challenge: {
    readonly challenge_id: string
    readonly methods_available: readonly ('totp' | 'recovery_code')[]
    readonly expires_at: string
  }
}

/**
 * BE-FR020-001: Lost-factor recovery response.
 *
 * Returned when an admin has performed an emergency MFA reset on the user.
 * The frontend must redirect the authenticated session to the enrolment
 * surface and surface `mfa_reset_at` so the UX banner can explain why.
 */
export type SsoLoginMfaReenrollmentRequired = {
  readonly authenticated: false
  readonly error: 'mfa_reenrollment_required'
  readonly message: string
  readonly mfa_reset_at: string | null
}

export type SsoLoginResponse =
  | SsoLoginSuccess
  | SsoLoginFailure
  | SsoLoginMfaRequired
  | SsoLoginMfaReenrollmentRequired


export type SsoSessionResponse =
  | { readonly authenticated: true; readonly user: SsoUser }
  | { readonly authenticated: false }

export type SsoLogoutResponse = {
  readonly authenticated: false
  readonly revoked: boolean
}

export type SsoLoginPayload = {
  readonly identifier: string
  readonly password: string
  readonly auth_request_id?: string | null
}
