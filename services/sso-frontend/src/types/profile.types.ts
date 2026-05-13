/**
 * Profile domain types — kontrak dengan `services/sso-backend` endpoint `/api/profile/*`.
 */

export type ProfilePortal = {
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

export type ProfileUpdatePayload = {
  readonly display_name?: string
  readonly given_name?: string
  readonly family_name?: string
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
  /** Raw user-agent string from session creation (optional, backend may omit). */
  readonly user_agent?: string | null
  /** Whether this is the current browser session. */
  readonly is_current?: boolean
}

export type RevokeSessionResponse = {
  readonly session_id: string
  readonly revoked: true
  readonly revoked_refresh_tokens: number
  readonly backchannel_fanout?: number
}

export type RevokeAllSessionsResponse = {
  readonly revoked: true
  readonly revoked_sessions: number
  readonly revoked_refresh_tokens: number
  /** Number of client back-channel notifications that failed (FR-002-AC-14). */
  readonly failed_count?: number
  /** Client IDs where back-channel logout delivery failed. */
  readonly failed_clients?: readonly string[]
}

export type RevokeConnectedAppResponse = {
  readonly client_id: string
  readonly revoked: true
  readonly revoked_refresh_tokens: number
}
