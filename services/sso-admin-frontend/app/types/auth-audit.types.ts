
/** Authentication audit event — mirrors AdminAuthenticationAuditPresenter::event(). */
export type AuthAuditSubject = {
  readonly subject_id: string | null
  readonly email: string | null
}

export type AuthAuditRequest = {
  readonly ip_address: string | null
  readonly user_agent: string | null
  readonly request_id: string | null
}

export type AuthAuditEvent = {
  readonly event_id: string
  readonly event_type: string
  readonly outcome: string
  readonly subject: AuthAuditSubject
  readonly client_id: string | null
  readonly session_id: string | null
  readonly request: AuthAuditRequest
  readonly error_code: string | null
  // Backend-redacted free-form context (sensitive keys already → "[redacted]").
  readonly context: Readonly<Record<string, unknown>>
  readonly occurred_at: string | null
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
  readonly consent_action?: string
  readonly from?: string
  readonly to?: string
  readonly support_reference?: string
}

export type AuthAuditListResponse = {
  readonly events: readonly AuthAuditEvent[]
  readonly pagination?: AuthAuditPagination
}
