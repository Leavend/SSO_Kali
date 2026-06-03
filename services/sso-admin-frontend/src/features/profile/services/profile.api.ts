import { apiClient } from '@/lib/api/api-client'
import type { AdminProfileResponse } from '../types'

export const profileApi = {
  /**
   * Fetch the current admin principal.
   * Reuses the bootstrap endpoint GET /api/admin/me — already in ALLOWED_ADMIN_ROUTES.
   */
  getProfile(): Promise<AdminProfileResponse> {
    return apiClient.get<AdminProfileResponse>('/api/admin/me')
  },
}
