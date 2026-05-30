/**
 * Profile API — self-service user endpoints `/api/profile/*`.
 *
 * Sumber kontrak: services/sso-backend/routes/web.php
 */

import { apiClient } from '@/lib/api/api-client'
import {
  isPortalPreviewBypassEnabled,
  previewAuditEvents,
  previewConnectedApps,
  previewDataSubjectRequests,
  previewProfile,
  previewSessions,
  previewTrustedDevices,
} from '@/lib/portal-preview'
import type {
  ChangePasswordPayload,
  ChangePasswordResponse,
  ConfirmEmailChangePayload,
  ConfirmPhoneChangePayload,
  ConnectedApp,
  CreateDataSubjectRequestPayload,
  DataSubjectRequestSummary,
  EmailChangeResponse,
  PhoneChangeResponse,
  ProfilePortal,
  ProfileUpdatePayload,
  RenameTrustedDevicePayload,
  RenameTrustedDeviceResponse,
  RequestEmailChangePayload,
  RequestPhoneChangePayload,
  RevokeAllSessionsResponse,
  RevokeConnectedAppResponse,
  RevokeSessionResponse,
  RevokeTrustedDeviceResponse,
  TrustedDeviceSummary,
  UserSessionSummary,
} from '@/types/profile.types'
import type { AuditListResponse } from '@/types/audit.types'

export const profileApi = {
  getProfile(): Promise<ProfilePortal> {
    if (isPortalPreviewBypassEnabled()) return Promise.resolve(previewProfile)
    return apiClient.get<ProfilePortal>('/api/profile')
  },
  updateProfile(payload: ProfileUpdatePayload): Promise<ProfilePortal> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        ...previewProfile,
        profile: { ...previewProfile.profile, ...payload },
      })
    }
    return apiClient.patch<ProfilePortal>('/api/profile', payload)
  },
  async getConnectedApps(): Promise<readonly ConnectedApp[]> {
    if (isPortalPreviewBypassEnabled()) return previewConnectedApps
    const data = await apiClient.get<{ connected_apps: ConnectedApp[] }>(
      '/api/profile/connected-apps',
    )
    return data.connected_apps
  },
  revokeConnectedApp(clientId: string): Promise<RevokeConnectedAppResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ client_id: clientId, revoked: true, revoked_refresh_tokens: 1 })
    }
    return apiClient.delete<RevokeConnectedAppResponse>(
      `/api/profile/connected-apps/${encodeURIComponent(clientId)}`,
    )
  },
  async getSessions(): Promise<readonly UserSessionSummary[]> {
    if (isPortalPreviewBypassEnabled()) return previewSessions
    const data = await apiClient.get<{ sessions: UserSessionSummary[] }>('/api/profile/sessions')
    return data.sessions
  },
  async getTrustedDevices(): Promise<readonly TrustedDeviceSummary[]> {
    if (isPortalPreviewBypassEnabled()) return previewTrustedDevices
    const data = await apiClient.get<{ devices: TrustedDeviceSummary[] }>('/api/profile/devices')
    return data.devices
  },
  renameTrustedDevice(
    deviceId: number,
    payload: RenameTrustedDevicePayload,
  ): Promise<RenameTrustedDeviceResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ device: { id: deviceId, label: payload.label } })
    }
    return apiClient.patch<RenameTrustedDeviceResponse>(`/api/profile/devices/${deviceId}`, payload)
  },
  revokeTrustedDevice(deviceId: number): Promise<RevokeTrustedDeviceResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ device_id: deviceId, revoked: true })
    }
    return apiClient.delete<RevokeTrustedDeviceResponse>(`/api/profile/devices/${deviceId}`)
  },
  revokeSession(sessionId: string): Promise<RevokeSessionResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        session_id: sessionId,
        revoked: true,
        revoked_refresh_tokens: 1,
      })
    }
    return apiClient.delete<RevokeSessionResponse>(
      `/api/profile/sessions/${encodeURIComponent(sessionId)}`,
    )
  },
  revokeAllSessions(): Promise<RevokeAllSessionsResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ revoked: true, revoked_sessions: 2, revoked_refresh_tokens: 3 })
    }
    return apiClient.delete<RevokeAllSessionsResponse>('/api/profile/sessions')
  },
  async getAuditEvents(event?: string, limit = 10): Promise<AuditListResponse> {
    if (isPortalPreviewBypassEnabled()) return previewAuditEvents
    const params = new URLSearchParams()
    if (event) params.set('event', event)
    params.set('limit', String(limit))
    return apiClient.get<AuditListResponse>(`/api/profile/audit?${params.toString()}`)
  },
  changePassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({
        message: 'Password preview berhasil divalidasi (tanpa backend).',
        changed_at: new Date().toISOString(),
        other_sessions_revoked: true,
      })
    }
    return apiClient.post<ChangePasswordResponse>('/api/profile/change-password', payload)
  },
  async getDataSubjectRequests(): Promise<readonly DataSubjectRequestSummary[]> {
    if (isPortalPreviewBypassEnabled()) return previewDataSubjectRequests
    const data = await apiClient.get<{ requests: DataSubjectRequestSummary[] }>(
      '/api/profile/data-subject-requests',
    )
    return data.requests
  },
  requestEmailChange(payload: RequestEmailChangePayload): Promise<EmailChangeResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ message: 'Token verifikasi telah dikirim ke email baru.' })
    }
    return apiClient.post<EmailChangeResponse>('/api/profile/email-change', payload)
  },
  confirmEmailChange(payload: ConfirmEmailChangePayload): Promise<EmailChangeResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ message: 'Email berhasil diubah.' })
    }
    return apiClient.post<EmailChangeResponse>('/api/profile/email-change/confirm', payload)
  },
  requestPhoneChange(payload: RequestPhoneChangePayload): Promise<PhoneChangeResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ message: 'Kode OTP telah dikirim ke nomor baru.' })
    }
    return apiClient.post<PhoneChangeResponse>('/api/profile/phone-change', payload)
  },
  confirmPhoneChange(payload: ConfirmPhoneChangePayload): Promise<PhoneChangeResponse> {
    if (isPortalPreviewBypassEnabled()) {
      return Promise.resolve({ message: 'Nomor telepon berhasil diubah.' })
    }
    return apiClient.post<PhoneChangeResponse>('/api/profile/phone-change/confirm', payload)
  },
  async createDataSubjectRequest(
    payload: CreateDataSubjectRequestPayload,
  ): Promise<DataSubjectRequestSummary> {
    if (isPortalPreviewBypassEnabled()) {
      return {
        request_id: `dsr-preview-${Date.now()}`,
        type: payload.type,
        status: 'submitted',
        reason: payload.reason ?? null,
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        fulfilled_at: null,
        sla_due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
    }
    const data = await apiClient.post<{ request: DataSubjectRequestSummary }>(
      '/api/profile/data-subject-requests',
      payload,
    )
    return data.request
  },
}
