import { apiClient } from '@/lib/api/api-client'
import { buildAuthAuditQuery } from '@/lib/auth-audit/auth-audit-query'
import type { AuthAuditFilters, AuthAuditListResponse } from '@/types/auth-audit.types'

const AUTH_AUDIT_PATH = '/api/admin/audit/authentication-events'

export const authAuditApi = {
  // GET the authentication-event page for the given filters (incl. cursor). The
  // BFF injects the Bearer token; the SPA is token-blind. The `show`-by-id route
  // exists but is unused — the list rows carry the full event shape, so the detail
  // drawer renders from the selected row.
  listEvents(filters: AuthAuditFilters = {}): Promise<AuthAuditListResponse> {
    return apiClient.get<AuthAuditListResponse>(buildAuthAuditQuery(AUTH_AUDIT_PATH, filters))
  },
}
