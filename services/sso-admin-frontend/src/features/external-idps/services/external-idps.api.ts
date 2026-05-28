import { apiClient } from '@/lib/api/api-client'
import type {
  ExternalIdpCreatePayload,
  ExternalIdpDetailResponse,
  ExternalIdpListResponse,
  ExternalIdpMappingPreviewResponse,
  ExternalIdpUpdatePayload,
} from '../types'

const BASE = '/api/admin/external-idps'

export const externalIdpsApi = {
  list(): Promise<ExternalIdpListResponse> {
    return apiClient.get<ExternalIdpListResponse>(BASE)
  },

  show(providerKey: string): Promise<ExternalIdpDetailResponse> {
    return apiClient.get<ExternalIdpDetailResponse>(`${BASE}/${providerKey}`)
  },

  create(payload: ExternalIdpCreatePayload): Promise<ExternalIdpDetailResponse> {
    return apiClient.post<ExternalIdpDetailResponse>(BASE, payload)
  },

  update(
    providerKey: string,
    payload: ExternalIdpUpdatePayload,
  ): Promise<ExternalIdpDetailResponse> {
    return apiClient.patch<ExternalIdpDetailResponse>(`${BASE}/${providerKey}`, payload)
  },

  previewMapping(
    providerKey: string,
    claims: Readonly<Record<string, unknown>>,
  ): Promise<ExternalIdpMappingPreviewResponse> {
    return apiClient.post<ExternalIdpMappingPreviewResponse>(
      `${BASE}/${providerKey}/mapping-preview`,
      { claims },
    )
  },

  delete(providerKey: string): Promise<void> {
    return apiClient.delete<void>(`${BASE}/${providerKey}`)
  },
}
