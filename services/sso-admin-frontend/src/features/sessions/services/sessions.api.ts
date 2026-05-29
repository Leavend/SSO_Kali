import { apiClient } from '@/lib/api/api-client'
import type { AdminSession, SessionRevokeResponse } from '../types'

export const sessionsApi = {
  list(): Promise<{ sessions: readonly AdminSession[] }> {
    return apiClient.get<{ sessions: readonly AdminSession[] }>('/api/admin/sessions')
  },
  show(sessionId: string): Promise<AdminSession> {
    return apiClient.get<AdminSession>(`/api/admin/sessions/${sessionId}`)
  },
  revoke(sessionId: string): Promise<SessionRevokeResponse> {
    return apiClient.delete<SessionRevokeResponse>(`/api/admin/sessions/${sessionId}`)
  },
  revokeUserSessions(subjectId: string): Promise<{ revoked_count: number }> {
    return apiClient.delete<{ revoked_count: number }>(`/api/admin/users/${subjectId}/sessions`)
  },
}
