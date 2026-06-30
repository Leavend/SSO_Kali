import { apiClient } from '@/lib/api/api-client'
import type { AdminPrincipalResponse, SsoSessionResponse } from '@/types/auth.types'

export const authApi = {
  getSession(): Promise<SsoSessionResponse> {
    return apiClient.get<SsoSessionResponse>('/api/auth/session')
  },
  getPrincipal(): Promise<AdminPrincipalResponse> {
    return apiClient.get<AdminPrincipalResponse>('/api/admin/me')
  },
}
