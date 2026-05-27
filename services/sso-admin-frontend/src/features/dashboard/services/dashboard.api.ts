import { apiClient } from '@/lib/api/api-client'
import type { DashboardSummary } from '../types'

export const dashboardApi = {
  getSummary(): Promise<DashboardSummary> {
    return apiClient.get<DashboardSummary>('/api/admin/dashboard/summary')
  },
}
