import { apiClient } from '@/lib/api/api-client'
import type {
  PermissionsListResponse,
  RolesListResponse,
  CreateRolePayload,
  UpdateRolePayload,
  AdminRole,
} from '../types'

export const rolesApi = {
  listRoles(): Promise<RolesListResponse> {
    return apiClient.get<RolesListResponse>('/api/admin/roles')
  },

  listPermissions(): Promise<PermissionsListResponse> {
    return apiClient.get<PermissionsListResponse>('/api/admin/permissions')
  },

  createRole(payload: CreateRolePayload): Promise<{ role: AdminRole }> {
    return apiClient.post<{ role: AdminRole }>('/api/admin/roles', payload)
  },

  updateRole(slug: string, payload: UpdateRolePayload): Promise<{ role: AdminRole }> {
    return apiClient.patch<{ role: AdminRole }>(`/api/admin/roles/${encodeURIComponent(slug)}`, payload)
  },

  deleteRole(slug: string): Promise<{ deleted: boolean; role_slug: string }> {
    return apiClient.delete<{ deleted: boolean; role_slug: string }>(`/api/admin/roles/${encodeURIComponent(slug)}`)
  },

  syncRolePermissions(slug: string, permissionSlugs: string[]): Promise<{ role: AdminRole }> {
    return apiClient.put<{ role: AdminRole }>(`/api/admin/roles/${encodeURIComponent(slug)}/permissions`, {
      permission_slugs: permissionSlugs,
    })
  },
}
