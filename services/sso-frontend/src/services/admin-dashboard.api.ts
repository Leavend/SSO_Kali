import { adminBffRequest } from './admin-bff-client'
import type { AdminDashboardSummary } from '@/types/admin.types'

export const adminDashboardApi = {
  summary(): Promise<AdminDashboardSummary> {
    return adminBffRequest<AdminDashboardSummary>('/api/admin/dashboard/summary')
  },
}
