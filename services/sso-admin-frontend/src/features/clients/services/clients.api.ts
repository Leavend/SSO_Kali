import { apiClient } from '@/lib/api/api-client'
import type {
  ClientCreatePayload,
  ClientDetailResponse,
  ClientLifecyclePayload,
  ClientLifecycleResponse,
  ClientListResponse,
  ClientSecretRotationResponse,
  ClientUpdatePayload,
} from '../types'

export const clientsApi = {
  list(): Promise<ClientListResponse> {
    return apiClient.get<ClientListResponse>('/api/admin/clients')
  },
  show(clientId: string): Promise<ClientDetailResponse> {
    return apiClient.get<ClientDetailResponse>(`/api/admin/clients/${clientId}`)
  },
  create(payload: ClientCreatePayload): Promise<ClientDetailResponse> {
    return apiClient.post<ClientDetailResponse>('/api/admin/clients', payload)
  },
  update(clientId: string, payload: ClientUpdatePayload): Promise<ClientDetailResponse> {
    return apiClient.patch<ClientDetailResponse>(`/api/admin/clients/${clientId}`, payload)
  },
  disable(clientId: string, payload: ClientLifecyclePayload): Promise<ClientLifecycleResponse> {
    return apiClient.post<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${clientId}/disable`,
      payload,
    )
  },
  decommission(clientId: string): Promise<ClientLifecycleResponse> {
    return apiClient.delete<ClientLifecycleResponse>(`/api/admin/clients/${clientId}`)
  },
  rotateSecret(clientId: string): Promise<ClientSecretRotationResponse> {
    return apiClient.post<ClientSecretRotationResponse>(
      `/api/admin/clients/${clientId}/rotate-secret`,
    )
  },
}
