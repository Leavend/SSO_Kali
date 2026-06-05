import { apiClient } from '@/lib/api/api-client'
import type {
  PermissionsListResponse,
  RolesListResponse,
  CreateRolePayload,
  UpdateRolePayload,
} from '../types'

export const rolesApi = {
  listRoles(): Promise<RolesListResponse> {
    return apiClient.get<RolesListResponse>('/api/admin/roles')
  },

  listPermissions(): Promise<PermissionsListResponse> {
    return apiClient.get<PermissionsListResponse>('/api/admin/permissions')
  },

  createRole(payload: CreateRolePayload): Promise<{ role: any }> {
    return apiClient.post<{ role: any }>('/api/admin/roles', payload)
  },

  updateRole(slug: string, payload: UpdateRolePayload): Promise<{ role: any }> {
    return apiClient.patch<{ role: any }>(`/api/admin/roles/${slug}`, payload)
  },

  deleteRole(slug: string): Promise<{ deleted: boolean; role_slug: string }> {
    return apiClient.delete<{ deleted: boolean; role_slug: string }>(`/api/admin/roles/${slug}`)
  },

  syncRolePermissions(slug: string, permissionSlugs: string[]): Promise<{ role: any }> {
    return apiClient.put<{ role: any }>(`/api/admin/roles/${slug}/permissions`, {
      permission_slugs: permissionSlugs,
    })
  },
}
