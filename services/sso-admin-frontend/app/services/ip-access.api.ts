// app/services/ip-access.api.ts
import { apiClient } from '@/lib/api/api-client'
import type {
  IpAccessListResponse,
  IpAccessRuleCreatePayload,
  IpAccessRuleResponse,
} from '@/types/ip-access.types'

const BASE = '/api/admin/ip-access-rules'

export const ipAccessApi = {
  list(): Promise<IpAccessListResponse> {
    return apiClient.get<IpAccessListResponse>(BASE)
  },
  create(payload: IpAccessRuleCreatePayload): Promise<IpAccessRuleResponse> {
    return apiClient.post<IpAccessRuleResponse>(BASE, payload)
  },
  // id is the backend's numeric primary key (route param [0-9]+) — safe to
  // interpolate directly; no encodeURIComponent needed for a number.
  remove(id: number): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${id}`)
  },
}
