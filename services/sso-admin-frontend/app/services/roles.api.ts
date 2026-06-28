import { apiClient } from '@/lib/api/api-client'
import type {
  CreateRolePayload,
  PermissionsResponse,
  RoleDeleteResponse,
  RoleMutationResponse,
  RolesResponse,
  SyncPermissionsPayload,
  UpdateRolePayload,
} from '@/types/users.types'

// Same-origin BFF paths. The Nitro proxy (server/utils/admin-proxy.ts) injects the
// Bearer access token from event.context and rewrites /api/admin/* → /admin/api/*
// before forwarding to the backend. Every Phase-7 roles route is already allow-listed.
//
// Single network seam for the Roles domain: pure forwarding — no rendering, no error
// mapping, no token/secret handling. On create, optional fields are omitted when empty
// so the backend `sometimes` validators never see '' / undefined. On update,
// description:null is the meaningful "clear the description" state, forwarded whenever
// it is not undefined. The slug is encodeURIComponent'd defensively (valid slugs match
// [a-z0-9_-]+, so this is the identity for every real role).
function rolePath(slug: string): string {
  return `/api/admin/roles/${encodeURIComponent(slug)}`
}

export const rolesApi = {
  list(): Promise<RolesResponse> {
    return apiClient.get<RolesResponse>('/api/admin/roles')
  },

  permissions(): Promise<PermissionsResponse> {
    return apiClient.get<PermissionsResponse>('/api/admin/permissions')
  },

  store(payload: CreateRolePayload): Promise<RoleMutationResponse> {
    return apiClient.post<RoleMutationResponse>('/api/admin/roles', {
      slug: payload.slug,
      name: payload.name,
      ...(payload.description && { description: payload.description }),
      ...(payload.permission_slugs && { permission_slugs: payload.permission_slugs }),
    })
  },

  update(slug: string, payload: UpdateRolePayload): Promise<RoleMutationResponse> {
    return apiClient.patch<RoleMutationResponse>(rolePath(slug), {
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.description !== undefined && { description: payload.description }),
    })
  },

  syncPermissions(slug: string, payload: SyncPermissionsPayload): Promise<RoleMutationResponse> {
    return apiClient.put<RoleMutationResponse>(`${rolePath(slug)}/permissions`, {
      permission_slugs: payload.permission_slugs,
    })
  },

  destroy(slug: string): Promise<RoleDeleteResponse> {
    return apiClient.delete<RoleDeleteResponse>(rolePath(slug))
  },
}
