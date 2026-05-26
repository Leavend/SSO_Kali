import { apiClient } from '@/lib/api/api-client'
import type { OidcFoundationSnapshot } from '../types'

export const oidcFoundationApi = {
  getSnapshot(): Promise<OidcFoundationSnapshot> {
    return apiClient.get<OidcFoundationSnapshot>('/api/admin/oidc-foundation')
  },
}
