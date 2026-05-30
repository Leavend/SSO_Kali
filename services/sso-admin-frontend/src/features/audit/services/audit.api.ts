import { apiClient } from '@/lib/api/api-client'
import type { BlobResponse } from '@/lib/api/api-client'
import type {
  AuditEventDetailResponse,
  AuditEventFilters,
  AuditEventListResponse,
  AuthenticationAuditEventDetailResponse,
  AuthenticationAuditEventFilters,
  AuthenticationAuditEventListResponse,
  AuditExportFilters,
  AuditIntegrityResponse,
  ComplianceEvidencePackFilters,
  DataSubjectFulfillPayload,
  DataSubjectRequestFilters,
  DataSubjectRequestListResponse,
  DataSubjectReviewPayload,
} from '../types'

export const auditApi = {
  listEvents(filters: AuditEventFilters = {}): Promise<AuditEventListResponse> {
    return apiClient.get<AuditEventListResponse>(withQuery('/api/admin/audit/events', filters))
  },
  showEvent(eventId: string): Promise<AuditEventDetailResponse> {
    return apiClient.get<AuditEventDetailResponse>(`/api/admin/audit/events/${eventId}`)
  },
  getIntegrity(): Promise<AuditIntegrityResponse> {
    return apiClient.get<AuditIntegrityResponse>('/api/admin/audit/integrity')
  },
  exportEvents(filters: AuditExportFilters): Promise<BlobResponse> {
    return apiClient.getBlob(withQuery('/api/admin/audit/export', filters))
  },
  generateEvidencePack(filters: ComplianceEvidencePackFilters): Promise<BlobResponse> {
    return apiClient.getBlob(withQuery('/api/admin/compliance/evidence-pack', filters))
  },
  listDataSubjectRequests(
    filters: DataSubjectRequestFilters = {},
  ): Promise<DataSubjectRequestListResponse> {
    return apiClient.get<DataSubjectRequestListResponse>(
      withQuery('/api/admin/data-subject-requests', filters),
    )
  },
  listAuthenticationEvents(
    filters: AuthenticationAuditEventFilters = {},
  ): Promise<AuthenticationAuditEventListResponse> {
    return apiClient.get<AuthenticationAuditEventListResponse>(
      withQuery('/api/admin/audit/authentication-events', filters),
    )
  },
  showAuthenticationEvent(eventId: string): Promise<AuthenticationAuditEventDetailResponse> {
    return apiClient.get<AuthenticationAuditEventDetailResponse>(
      `/api/admin/audit/authentication-events/${eventId}`,
    )
  },
  reviewDataSubjectRequest(
    requestId: string,
    payload: DataSubjectReviewPayload,
  ): Promise<{
    readonly request: import('../types').DataSubjectRequest
  }> {
    return apiClient.post(`/api/admin/data-subject-requests/${requestId}/review`, payload)
  },
  fulfillDataSubjectRequest(
    requestId: string,
    payload: DataSubjectFulfillPayload,
  ): Promise<unknown> {
    return apiClient.post(`/api/admin/data-subject-requests/${requestId}/fulfill`, payload)
  },
}

function withQuery(path: string, query: Readonly<Record<string, unknown>>): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }

  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}
