/**
 * Auth API — thin wrapper ke endpoint native `/api/auth/*`.
 *
 * Sumber kontrak: services/sso-backend/routes/auth.php
 */

import { apiClient } from '@/lib/api/api-client'
import type {
  SsoLoginPayload,
  SsoLoginResponse,
  SsoLogoutResponse,
  SsoSessionResponse,
} from '@/types/auth.types'

export const authApi = {
  getSession(): Promise<SsoSessionResponse> {
    return apiClient.get<SsoSessionResponse>('/api/auth/session')
  },
  login(payload: SsoLoginPayload): Promise<SsoLoginResponse> {
    return apiClient.post<SsoLoginResponse>('/api/auth/login', payload)
  },
  logout(): Promise<SsoLogoutResponse> {
    return apiClient.post<SsoLogoutResponse>('/api/auth/logout')
  },
}
