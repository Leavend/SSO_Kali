// Safe, masked compliance DTOs for the audit/retention/DSR endpoints.
// PII minimization (design §3.3/§9): the DSR list projection carries ONLY the
// opaque OIDC `subject_id` — NO email, NIK/NIP/NISN, or name, AND no free-text
// `reason`/`reviewer_notes`/`reviewer_subject_id`. The backend presenter emits
// those (it is shared with the review response), but they are a real-name/email
// leak vector into `__NUXT_DATA__`, so the list-item type below drops them and
// observability.api.listDataSubjectRequests strips them at runtime per row
// (Task 6.4) — type-narrowing alone does NOT remove serialized keys. The UI
// masks `request_id`/`subject_id` for display. The two export/evidence filter
// types build the blob-download query strings only (pure query builders, Task 6.2).
export type RetentionWindow = {
  readonly days?: number
  readonly hours?: number
  readonly seconds?: number
}

export type RetentionItem = {
  readonly category: string
  readonly label: string
  readonly window: RetentionWindow
  readonly cutoff?: string
  readonly schedule?: string
  readonly candidate_count?: number | null
  readonly last_pruned_at?: string | null
  readonly last_pruned_count?: number | null
}

export type RetentionStatus = {
  readonly generated_at: string
  readonly items: readonly RetentionItem[]
}

export type RetentionResponse = {
  readonly retention: RetentionStatus
}

export type DsrType = 'export' | 'delete' | 'anonymize'

export type DsrStatus =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'fulfilled'
  | 'cancelled'
  | 'on_hold'

// NARROWED list-item projection: ONLY the fields the queue table + drawer render.
// `reason`/`reviewer_notes`/`reviewer_subject_id` are deliberately absent — they
// carry free-text PII (a subject's real name/email) and are stripped per row in
// observability.api.listDataSubjectRequests (Task 6.4), proven by the gate canary
// (Task 6.12). The review/fulfill responses reuse this same narrowed shape.
export type DataSubjectRequest = {
  readonly request_id: string
  readonly subject_id: string
  readonly type: DsrType
  readonly status: DsrStatus
  readonly submitted_at: string
  readonly reviewed_at?: string | null
  readonly fulfilled_at?: string | null
  readonly sla_due_at?: string | null
}

export type DsrListResponse = {
  readonly requests: readonly DataSubjectRequest[]
}

export type DsrReviewPayload = {
  readonly decision: 'approved' | 'rejected'
  readonly notes?: string
}

export type DsrReviewResponse = {
  readonly request: DataSubjectRequest
}

export type DsrFulfillPayload = {
  readonly dry_run?: boolean
}

export type DsrFulfillResponse = {
  readonly request: DataSubjectRequest
  readonly artifact?: unknown
  readonly artifact_id?: number | null
  readonly dry_run: boolean
  readonly legal_hold_status: string
}

export type AuditExportFormat = 'csv' | 'jsonl'

export type AuditExportFilters = {
  readonly format: AuditExportFormat
  readonly from?: string
  readonly to?: string
  readonly action?: string
  readonly outcome?: 'succeeded' | 'denied' | 'failed'
  readonly taxonomy?: string
  readonly admin_subject_id?: string
  readonly request_id?: string
  readonly support_reference?: string
}

export type EvidencePackFormat = 'zip' | 'json'

export type ComplianceEvidencePackFilters = {
  readonly format?: EvidencePackFormat
  readonly from?: string
  readonly to?: string
  readonly correlation_id?: string
}
