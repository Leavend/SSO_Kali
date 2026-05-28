import { apiClient } from '@/lib/api/api-client'
import type { OpsReadiness } from '../types'

export const opsApi = {
  getReadiness(): Promise<OpsReadiness> {
    return apiClient.get<OpsReadiness>('/api/admin/ops/readiness')
  },
}
