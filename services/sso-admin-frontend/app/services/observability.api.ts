import { apiClient, type BlobResponse } from '@/lib/api/api-client'
import { buildAuditExportQuery, buildEvidencePackQuery } from '@/lib/compliance/audit-export'
import type { ObservabilitySummary } from '@/types/observability.types'
import type {
  AuditExportFilters,
  ComplianceEvidencePackFilters,
  DataSubjectRequest,
  DsrFulfillPayload,
  DsrFulfillResponse,
  DsrListResponse,
  DsrReviewPayload,
  DsrReviewResponse,
  RetentionResponse,
} from '@/types/compliance.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The SPA is token-blind.
//
// This is the FIRST consumer of apiClient.getBlob: the audit export and the
// compliance evidence-pack are streamed Content-Disposition attachments. A
// non-2xx blob throws ApiError exactly like a JSON call, so the download flows
// route through the same privileged-action failure matrix. The blob is returned
// untouched and is never persisted here.

// The backend DSR presenter is SHARED with the review response, so each list row
// carries free-text reason/reviewer_notes/reviewer_subject_id — a real-name/email
// leak vector into __NUXT_DATA__. Map each row to the narrowed DataSubjectRequest
// at RUNTIME so the stripped keys are physically ABSENT from the serialized object
// (type-narrowing alone does NOT remove serialized keys). Proven by the Task-6.12
// gate canary. The DSR queue filters client-side (Task 6.6), so there is no query.
function toDsrListItem(row: DataSubjectRequest): DataSubjectRequest {
  return {
    request_id: row.request_id,
    subject_id: row.subject_id,
    type: row.type,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at ?? null,
    fulfilled_at: row.fulfilled_at ?? null,
    sla_due_at: row.sla_due_at ?? null,
  }
}

export const observabilityApi = {
  getSummary(): Promise<ObservabilitySummary> {
    return apiClient.get<ObservabilitySummary>('/api/admin/observability/summary')
  },

  getRetention(): Promise<RetentionResponse> {
    return apiClient.get<RetentionResponse>('/api/admin/audit/retention')
  },

  async listDataSubjectRequests(): Promise<DsrListResponse> {
    // Plain GET, no query string — the queue filters client-side (Task 6.6).
    // Strip the free-text PII off every row before it can hydrate to the client.
    const response = await apiClient.get<DsrListResponse>('/api/admin/data-subject-requests')
    return { requests: response.requests.map(toDsrListItem) }
  },

  reviewDsr(requestId: string, payload: DsrReviewPayload): Promise<DsrReviewResponse> {
    return apiClient.post<DsrReviewResponse>(
      `/api/admin/data-subject-requests/${requestId}/review`,
      payload,
    )
  },

  fulfillDsr(requestId: string, payload: DsrFulfillPayload): Promise<DsrFulfillResponse> {
    return apiClient.post<DsrFulfillResponse>(
      `/api/admin/data-subject-requests/${requestId}/fulfill`,
      payload,
    )
  },

  exportAuditTrail(filters: AuditExportFilters): Promise<BlobResponse> {
    return apiClient.getBlob('/api/admin/audit/export' + buildAuditExportQuery(filters))
  },

  generateEvidencePack(filters: ComplianceEvidencePackFilters): Promise<BlobResponse> {
    return apiClient.getBlob(
      '/api/admin/compliance/evidence-pack' + buildEvidencePackQuery(filters),
    )
  },
}
