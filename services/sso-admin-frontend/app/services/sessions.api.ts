import { apiClient } from '@/lib/api/api-client'
import type { SessionListResponse, SessionRevokeResponse } from '@/types/sessions.types'

// Single network seam for the admin-sessions domain. The BFF rewrites /api/admin/* ->
// /admin/api/* and injects the Bearer; both routes are already in the proxy allow-list.
export const sessionsApi = {
  list(): Promise<SessionListResponse> {
    return apiClient.get<SessionListResponse>('/api/admin/sessions')
  },
  revoke(sessionId: string): Promise<SessionRevokeResponse> {
    return apiClient.delete<SessionRevokeResponse>(
      `/api/admin/sessions/${encodeURIComponent(sessionId)}`,
    )
  },
}
