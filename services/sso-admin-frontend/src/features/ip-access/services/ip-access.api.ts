import { apiClient } from '@/lib/api/api-client'
import type { IpAccessRule, IpAccessRuleCreatePayload } from '../types'

export const ipAccessApi = {
  list(): Promise<{ rules: readonly IpAccessRule[] }> {
    return apiClient.get<{ rules: readonly IpAccessRule[] }>('/api/admin/ip-access-rules')
  },

  create(payload: IpAccessRuleCreatePayload): Promise<{ rule: IpAccessRule }> {
    return apiClient.post<{ rule: IpAccessRule }>('/api/admin/ip-access-rules', payload)
  },

  destroy(id: number): Promise<void> {
    return apiClient.delete<void>(`/api/admin/ip-access-rules/${id}`)
  },
}
