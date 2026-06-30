import { apiClient } from '@/lib/api/api-client'
import type { OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

export const oidcFoundationApi = {
  // GET the OIDC foundation snapshot. The BFF injects the Bearer token; the SPA is
  // token-blind. The response is all public OIDC discovery metadata + health.
  getSnapshot(): Promise<OidcFoundationSnapshot> {
    return apiClient.get<OidcFoundationSnapshot>('/api/admin/oidc-foundation')
  },
}
