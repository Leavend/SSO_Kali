import { apiClient } from '@/lib/api/api-client'
import type { DashboardSummary } from '@/types/dashboard.types'

// Same-origin BFF path. The Nitro proxy (server/utils/admin-proxy.ts) injects
// the Bearer access token from event.context and rewrites /api/admin/* →
// /admin/api/* before forwarding to the backend. The browser/SPA is token-blind.
export const dashboardApi = {
  getSummary(): Promise<DashboardSummary> {
    return apiClient.get<DashboardSummary>('/api/admin/dashboard/summary')
  },
}
