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

export type SsoLoginResponse = SsoLoginSuccess | SsoLoginFailure | SsoLoginMfaRequired


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
