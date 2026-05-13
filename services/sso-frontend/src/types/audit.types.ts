/**
 * Audit types — kontrak untuk endpoint `/api/profile/audit`.
 */

/** Single audit event entry. */
export type AuditEvent = {
  readonly id: string
  readonly event: AuditEventType
  readonly ip_address: string | null
  readonly user_agent: string | null
  readonly created_at: string
  readonly metadata?: Record<string, unknown>
}

/** Supported audit event types relevant to user portal. */
export type AuditEventType =
  | 'login'
  | 'logout'
  | 'logout_all'
  | 'session_revoked'
  | 'token_refreshed'
  | 'password_changed'
  | 'profile_updated'
  | 'connected_app_revoked'

/** Response from GET /api/profile/audit. */
export type AuditListResponse = {
  readonly events: readonly AuditEvent[]
  readonly total: number
}
