export type AuditEventActor = {
  readonly subject_id?: string | null
  readonly email?: string | null
  readonly role?: string | null
}

export type AuditEventRequest = {
  readonly method?: string | null
  readonly path?: string | null
  readonly ip_address?: string | null
}

export type AuditEventHashChain = {
  readonly previous_hash?: string | null
  readonly event_hash?: string | null
}

export type AdminAuditEvent = {
  readonly event_id: string
  readonly action: string
  readonly outcome: string
  readonly taxonomy?: string | null
  readonly actor?: AuditEventActor | null
  readonly request?: AuditEventRequest | null
  readonly reason?: string | null
  readonly context?: Readonly<Record<string, unknown>> | null
  readonly hash_chain?: AuditEventHashChain | null
  readonly occurred_at?: string | null
}

export type AuditPagination = {
  readonly per_page?: number
  readonly next_cursor?: string | null
  readonly previous_cursor?: string | null
  readonly has_more?: boolean
}

export type AuditEventListResponse = {
  readonly events: readonly AdminAuditEvent[]
  readonly pagination?: AuditPagination
}

export type AuditEventDetailResponse = {
  readonly event: AdminAuditEvent
}

export type AuditIntegrity = {
  readonly verified?: boolean
  readonly checked_events?: number
  readonly broken_at_event_id?: string | null
  readonly latest_event_hash?: string | null
  readonly generated_at?: string | null
}

export type AuditIntegrityResponse = {
  readonly integrity: AuditIntegrity
}

export type AuditEventFilters = {
  readonly limit?: number
  readonly cursor?: string
  readonly action?: string
  readonly outcome?: string
  readonly taxonomy?: string
  readonly admin_subject_id?: string
  readonly from?: string
  readonly to?: string
}

export type AuditExportFilters = Omit<AuditEventFilters, 'limit' | 'cursor'> & {
  readonly format: 'csv' | 'jsonl'
}

/**
 * Filters for a curated compliance evidence pack (UC-65): a bundle covering an
 * audit subset, integrity hash-chain status, related DSR, and retention for a
 * single date range or incident correlation ID.
 */
export type ComplianceEvidencePackFilters = {
  readonly from?: string
  readonly to?: string
  readonly correlation_id?: string
  readonly format?: 'zip' | 'json'
}

export type AuthenticationAuditSubject = {
  readonly subject_id?: string | null
  readonly email?: string | null
}

export type AuthenticationAuditRequest = {
  readonly ip_address?: string | null
  readonly user_agent?: string | null
  readonly request_id?: string | null
}

export type AuthenticationAuditEvent = {
  readonly event_id: string
  readonly event_type: string
  readonly outcome: string
  readonly subject?: AuthenticationAuditSubject | null
  readonly client_id?: string | null
  readonly session_id?: string | null
  readonly request?: AuthenticationAuditRequest | null
  readonly error_code?: string | null
  readonly context?: Readonly<Record<string, unknown>> | null
  readonly occurred_at?: string | null
}

export type AuthenticationAuditEventFilters = {
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

export type AuthenticationAuditEventListResponse = {
  readonly events: readonly AuthenticationAuditEvent[]
  readonly pagination?: AuditPagination
}

export type AuthenticationAuditEventDetailResponse = {
  readonly event: AuthenticationAuditEvent
}

export type DataSubjectRequest = {
  readonly request_id: string
  readonly subject_id: string
  readonly type: string
  readonly status: string
  readonly reason?: string | null
  readonly reviewer_subject_id?: string | null
  readonly reviewer_notes?: string | null
  readonly submitted_at: string
  readonly reviewed_at?: string | null
  readonly fulfilled_at?: string | null
  readonly sla_due_at?: string | null
}

export type DataSubjectRequestFilters = {
  readonly status?: string
  readonly type?: string
  readonly subject_id?: string
}

export type DataSubjectRequestListResponse = {
  readonly requests: readonly DataSubjectRequest[]
}

export type DataSubjectReviewPayload = {
  readonly decision: 'approved' | 'rejected'
  readonly notes?: string
}

export type DataSubjectFulfillPayload = {
  readonly dry_run?: boolean
}
