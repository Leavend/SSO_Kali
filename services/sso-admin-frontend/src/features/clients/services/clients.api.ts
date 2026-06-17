import { apiClient } from '@/lib/api/api-client'
import type {
  ClientCreatePayload,
  ClientCreateResponse,
  ClientDetailResponse,
  ClientIntegrationContractResponse,
  ClientLifecyclePayload,
  ClientLifecycleResponse,
  ClientListResponse,
  ClientRegistrationsResponse,
  ClientScopeSyncPayload,
  ClientScopeSyncResponse,
  ClientSecretRotationResponse,
  ClientUpdatePayload,
} from '../types'

export const clientsApi = {
  list(): Promise<ClientListResponse> {
    return apiClient.get<ClientListResponse>('/api/admin/clients')
  },
  registrations(): Promise<ClientRegistrationsResponse> {
    return apiClient.get<ClientRegistrationsResponse>(
      '/api/admin/client-integrations/registrations',
    )
  },
  show(clientId: string): Promise<ClientDetailResponse> {
    return apiClient.get<ClientDetailResponse>(`/api/admin/clients/${clientId}`)
  },
  create(payload: ClientCreatePayload): Promise<ClientCreateResponse> {
    return apiClient.post<ClientCreateResponse>('/api/admin/client-integrations', payload)
  },
  update(clientId: string, payload: ClientUpdatePayload): Promise<ClientDetailResponse> {
    return apiClient.patch<ClientDetailResponse>(`/api/admin/clients/${clientId}`, payload)
  },
  syncScopes(clientId: string, payload: ClientScopeSyncPayload): Promise<ClientScopeSyncResponse> {
    return apiClient.put<ClientScopeSyncResponse>(`/api/admin/clients/${clientId}/scopes`, payload)
  },
  disable(clientId: string, payload: ClientLifecyclePayload): Promise<ClientLifecycleResponse> {
    return apiClient.post<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${clientId}/disable`,
      payload,
    )
  },
  decommission(clientId: string): Promise<ClientLifecycleResponse> {
    return apiClient.post<ClientLifecycleResponse>(
      `/api/admin/client-integrations/${clientId}/decommission`,
    )
  },
  delete(clientId: string): Promise<unknown> {
    return apiClient.delete<unknown>(`/api/admin/clients/${clientId}`)
  },
  getScopes(): Promise<{
    scopes: Array<{ name: string; description: string; claims: string[]; default_allowed: boolean }>
  }> {
    return apiClient.get<{
      scopes: Array<{
        name: string
        description: string
        claims: string[]
        default_allowed: boolean
      }>
    }>('/api/admin/scopes')
  },
  rotateSecret(clientId: string): Promise<ClientSecretRotationResponse> {
    return apiClient.post<ClientSecretRotationResponse>(
      `/api/admin/clients/${clientId}/rotate-secret`,
    )
  },
  contract(payload: ClientCreatePayload): Promise<ClientIntegrationContractResponse> {
    return apiClient.post<ClientIntegrationContractResponse>(
      '/api/admin/client-integrations/contract',
      payload,
    )
  },
}
