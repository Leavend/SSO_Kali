import { apiClient } from '@/lib/api/api-client'
import type {
  AdminPermission,
  AdminRole,
  RolePayload,
  SecurityPolicy,
  SecurityPolicyListResponse,
  SecurityPolicyMutationPayload,
  SecurityPolicyTransitionPayload,
} from '../types'

export const policyApi = {
  listPolicies(category: string): Promise<SecurityPolicyListResponse> {
    return apiClient.get<SecurityPolicyListResponse>(`/api/admin/security-policies/${category}`)
  },
  proposePolicy(
    category: string,
    payload: SecurityPolicyMutationPayload,
  ): Promise<{ readonly policy: SecurityPolicy }> {
    return apiClient.post(`/api/admin/security-policies/${category}`, payload)
  },
  activatePolicy(
    category: string,
    version: number,
    payload: SecurityPolicyTransitionPayload,
  ): Promise<{ readonly policy: SecurityPolicy }> {
    return apiClient.post(`/api/admin/security-policies/${category}/${version}/activate`, payload)
  },
  rollbackPolicy(
    category: string,
    version: number,
    payload: SecurityPolicyTransitionPayload,
  ): Promise<{ readonly policy: SecurityPolicy }> {
    return apiClient.post(`/api/admin/security-policies/${category}/${version}/rollback`, payload)
  },
  listRoles(): Promise<{ readonly roles: readonly AdminRole[] }> {
    return apiClient.get('/api/admin/roles')
  },
  listPermissions(): Promise<{ readonly permissions: readonly AdminPermission[] }> {
    return apiClient.get('/api/admin/permissions')
  },
  createRole(payload: RolePayload): Promise<{ readonly role: AdminRole }> {
    return apiClient.post('/api/admin/roles', payload)
  },
  updateRole(role: string, payload: RolePayload): Promise<{ readonly role: AdminRole }> {
    return apiClient.patch(`/api/admin/roles/${role}`, payload)
  },
  syncRolePermissions(
    role: string,
    permissionSlugs: readonly string[],
  ): Promise<{ readonly role: AdminRole }> {
    return apiClient.put(`/api/admin/roles/${role}/permissions`, {
      permission_slugs: permissionSlugs,
    })
  },
  deleteRole(role: string): Promise<{ readonly deleted: boolean }> {
    return apiClient.delete(`/api/admin/roles/${role}`)
  },
  syncUserRoles(
    subjectId: string,
    roleSlugs: readonly string[],
  ): Promise<{ readonly user: { readonly subject_id: string } }> {
    return apiClient.put(`/api/admin/users/${subjectId}/roles`, {
      roles: roleSlugs,
    })
  },
}
