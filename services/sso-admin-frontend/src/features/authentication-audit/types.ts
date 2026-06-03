/**
 * Authentication Audit domain types.
 * Contract: GET /admin/api/audit/authentication-events
 * FR-044 / UC-41–UC-42 — distinct from Audit Trail (admin.audit.read).
 * Permission: admin.authentication-audit.read
 *
 * NOTE: These types mirror the authentication-audit subset already defined
 * in the audit feature (audit/types.ts). This standalone module owns the
 * dedicated /authentication-audit route slice so concerns remain separated.
 */

export type AuthAuditSubject = {
  readonly subject_id?: string | null
  readonly email?: string | null
}

export type AuthAuditRequest = {
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly request_id?: string | null
}

export type AuthAuditEvent = {
  readonly event_id: string
  readonly event_type: string
  readonly outcome: string
  readonly subject?: AuthAuditSubject | null
  readonly client_id?: string | null
  readonly session_id?: string | null
  readonly request?: AuthAuditRequest | null
  readonly error_code?: string | null
  readonly context?: Readonly<Record<string, unknown>> | null
  readonly occurred_at?: string | null
}

export type AuthAuditPagination = {
  readonly per_page?: number
  readonly next_cursor?: string | null
  readonly previous_cursor?: string | null
  readonly has_more?: boolean
}

export type AuthAuditFilters = {
  readonly limit?: number
  readonly cursor?: string
  readonly event_type?: string
  readonly outcome?: string
  readonly subject_id?: string
  readonly client_id?: string
  readonly session_id?: string
  readonly request_id?: string
  readonly error_code?: string
  readonly from?: string
  readonly to?: string
}

export type AuthAuditListResponse = {
  readonly events: readonly AuthAuditEvent[]
  readonly pagination?: AuthAuditPagination
}

export type AuthAuditEventDetailResponse = {
  readonly event: AuthAuditEvent
}
