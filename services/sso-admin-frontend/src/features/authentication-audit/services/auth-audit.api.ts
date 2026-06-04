import { apiClient } from '@/lib/api/api-client'
import type {
  AuthAuditEventDetailResponse,
  AuthAuditFilters,
  AuthAuditListResponse,
} from '../types'

function withQuery(path: string, query: Readonly<Record<string, unknown>>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

export const authAuditApi = {
  listEvents(filters: AuthAuditFilters = {}): Promise<AuthAuditListResponse> {
    return apiClient.get<AuthAuditListResponse>(
      withQuery('/api/admin/audit/authentication-events', filters),
    )
  },

  showEvent(eventId: string): Promise<AuthAuditEventDetailResponse> {
    return apiClient.get<AuthAuditEventDetailResponse>(
      `/api/admin/audit/authentication-events/${eventId}`,
    )
  },
}
