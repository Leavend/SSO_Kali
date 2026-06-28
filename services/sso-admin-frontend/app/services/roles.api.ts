import { apiClient } from '@/lib/api/api-client'
import type { RolesResponse } from '@/types/users.types'

// Same-origin BFF path. The Nitro proxy (server/utils/admin-proxy.ts) injects the
// Bearer access token from event.context and rewrites /api/admin/* → /admin/api/*
// before forwarding to the backend. `GET /api/admin/roles` is already allow-listed.
export const rolesApi = {
  list(): Promise<RolesResponse> {
    return apiClient.get<RolesResponse>('/api/admin/roles')
  },
}
