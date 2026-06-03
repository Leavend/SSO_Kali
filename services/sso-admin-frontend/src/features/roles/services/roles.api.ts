import { apiClient } from '@/lib/api/api-client'
import type { PermissionsListResponse, RolesListResponse } from '../types'

export const rolesApi = {
  listRoles(): Promise<RolesListResponse> {
    return apiClient.get<RolesListResponse>('/api/admin/roles')
  },

  listPermissions(): Promise<PermissionsListResponse> {
    return apiClient.get<PermissionsListResponse>('/api/admin/permissions')
  },
}
