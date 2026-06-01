export type SsoAuthContext = {
  readonly auth_time: number | null
  readonly amr: readonly string[]
  readonly acr: string | null
}

export type SsoPrincipal = {
  readonly subjectId: string
  readonly email: string
  readonly displayName: string
  readonly role: string
  readonly expiresAt: number
  readonly authContext: SsoAuthContext
  readonly lastLoginAt: string | null
}

export type PortalSessionView = {
  readonly subject: string
  readonly email: string
  readonly displayName: string
  readonly role: string
  readonly expiresAt: number
  readonly authTime: number | null
  readonly amr: readonly string[]
  readonly acr: string | null
  readonly lastLoginAt: string | null
}

export type UserProfile = {
  readonly profile: {
    readonly subject_id: string
    readonly display_name?: string
    readonly given_name?: string
    readonly family_name?: string
    readonly email?: string
    readonly email_verified?: boolean
    readonly status: string
    readonly profile_synced_at?: string | null
    readonly last_login_at?: string | null
  }
  readonly authorization: {
    readonly scope: string
    readonly roles?: readonly string[]
    readonly permissions?: readonly string[]
  }
  readonly security: {
    readonly session_id: string | null
    readonly risk_score: number
    readonly mfa_required: boolean
    readonly last_seen_at: string | null
  }
}

export type ConnectedApp = {
  readonly client_id: string
  readonly display_name: string
  readonly first_connected_at: string
  readonly last_used_at: string
  readonly expires_at: string
  readonly active_refresh_tokens: number
}

export type UserSessionSummary = {
  readonly session_id: string
  readonly opened_at: string
  readonly last_used_at: string
  readonly expires_at: string
  readonly client_count: number
  readonly client_ids: readonly string[]
  readonly client_display_names: readonly string[]
}

export type ProfileUpdatePayload = {
  readonly display_name?: string
  readonly given_name?: string
  readonly family_name?: string
}
