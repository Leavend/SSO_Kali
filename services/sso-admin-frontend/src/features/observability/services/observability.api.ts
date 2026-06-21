import { apiClient } from '@/lib/api/api-client'
import type { ObservabilitySummary } from '../types'

export const observabilityApi = {
  getSummary(): Promise<ObservabilitySummary> {
    return apiClient.get<ObservabilitySummary>('/api/admin/observability/summary')
  },
}
