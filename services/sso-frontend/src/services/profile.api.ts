/**
 * Profile API — self-service user endpoints `/api/profile/*`.
 *
 * Sumber kontrak: services/sso-backend/routes/web.php
 */

import { apiClient } from '@/lib/api/api-client'
import type {
  ConnectedApp,
  ProfilePortal,
  ProfileUpdatePayload,
  RevokeAllSessionsResponse,
  RevokeConnectedAppResponse,
  RevokeSessionResponse,
  UserSessionSummary,
} from '@/types/profile.types'
import type { AuditListResponse } from '@/types/audit.types'

export const profileApi = {
  getProfile(): Promise<ProfilePortal> {
    return apiClient.get<ProfilePortal>('/api/profile')
  },
  updateProfile(payload: ProfileUpdatePayload): Promise<ProfilePortal> {
    return apiClient.patch<ProfilePortal>('/api/profile', payload)
  },
  async getConnectedApps(): Promise<readonly ConnectedApp[]> {
    const data = await apiClient.get<{ connected_apps: ConnectedApp[] }>(
      '/api/profile/connected-apps',
    )
    return data.connected_apps
  },
  revokeConnectedApp(clientId: string): Promise<RevokeConnectedAppResponse> {
    return apiClient.delete<RevokeConnectedAppResponse>(
      `/api/profile/connected-apps/${encodeURIComponent(clientId)}`,
    )
  },
  async getSessions(): Promise<readonly UserSessionSummary[]> {
    const data = await apiClient.get<{ sessions: UserSessionSummary[] }>('/api/profile/sessions')
    return data.sessions
  },
  revokeSession(sessionId: string): Promise<RevokeSessionResponse> {
    return apiClient.delete<RevokeSessionResponse>(
      `/api/profile/sessions/${encodeURIComponent(sessionId)}`,
    )
  },
  revokeAllSessions(): Promise<RevokeAllSessionsResponse> {
    return apiClient.delete<RevokeAllSessionsResponse>('/api/profile/sessions')
  },
  async getAuditEvents(event?: string, limit = 10): Promise<AuditListResponse> {
    const params = new URLSearchParams()
    if (event) params.set('event', event)
    params.set('limit', String(limit))
    return apiClient.get<AuditListResponse>(`/api/profile/audit?${params.toString()}`)
  },
  changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
    return apiClient.post<ChangePasswordResponse>('/api/profile/change-password', payload)
  },
}

export type ChangePasswordPayload = {
  readonly current_password: string
  readonly new_password: string
  readonly new_password_confirmation: string
}

export type ChangePasswordResponse = {
  readonly message: string
  readonly changed_at: string
}
