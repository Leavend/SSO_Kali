export interface AdminSession {
  readonly session_id: string
  readonly client_id?: string | null
  readonly subject_id?: string | null
  readonly user_email?: string | null
  readonly user_display_name?: string | null
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly created_at?: string | null
  readonly last_activity_at?: string | null
}

export interface SessionListResponse {
  readonly sessions: readonly AdminSession[]
}

export interface SessionDetailResponse {
  readonly session: AdminSession
}

export interface SessionRevokeResponse {
  readonly session_id: string
  readonly revoked: boolean
}
