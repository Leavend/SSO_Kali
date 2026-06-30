// Admin session DTOs — the EXACT backend shape from AdminSessionService::sessionPayload.
// The DTO carries only operational metadata: session_id is the opaque session HANDLE
// (the terminate key — an identifier, not a credential), subject_id is an opaque OIDC
// subject (ULID, not gov-PII), email is an allowed display field. No token/secret.
export interface AdminSession {
  readonly session_id: string
  readonly client_id?: string | null
  readonly subject_id?: string | null
  readonly email?: string | null
  readonly display_name?: string | null
  readonly scope?: string | null
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly created_at?: string | null
  readonly last_activity_at?: string | null
  readonly expires_at?: string | null
}

export interface SessionListResponse {
  readonly sessions: readonly AdminSession[]
}

// DELETE /sessions/{id} returns a superset of { revoked, session_id } with token-count
// metadata; revoking a missing session is NOT an error (200, revoked_tokens: 0).
export interface SessionRevokeResponse {
  readonly revoked: boolean
  readonly session_id: string
  readonly revoked_tokens?: number
  readonly backchannel_fanout?: number
}
