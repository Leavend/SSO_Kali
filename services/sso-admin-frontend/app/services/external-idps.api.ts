import { apiClient } from '@/lib/api/api-client'
import type {
  ExternalIdpCreatePayload,
  ExternalIdpDetailResponse,
  ExternalIdpListResponse,
  ExternalIdpMappingPreviewResponse,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

const BASE = '/api/admin/external-idps'

function keyPath(key: string): string {
  return `${BASE}/${encodeURIComponent(key)}`
}

export const externalIdpsApi = {
  list(): Promise<ExternalIdpListResponse> {
    return apiClient.get<ExternalIdpListResponse>(BASE)
  },
  show(key: string): Promise<ExternalIdpDetailResponse> {
    return apiClient.get<ExternalIdpDetailResponse>(keyPath(key))
  },
  create(payload: ExternalIdpCreatePayload): Promise<ExternalIdpDetailResponse> {
    return apiClient.post<ExternalIdpDetailResponse>(BASE, payload)
  },
  update(key: string, payload: ExternalIdpUpdatePayload): Promise<ExternalIdpDetailResponse> {
    return apiClient.patch<ExternalIdpDetailResponse>(keyPath(key), payload)
  },
  previewMapping(
    key: string,
    claims: Readonly<Record<string, unknown>>,
  ): Promise<ExternalIdpMappingPreviewResponse> {
    return apiClient.post<ExternalIdpMappingPreviewResponse>(`${keyPath(key)}/mapping-preview`, {
      claims,
    })
  },
  remove(key: string): Promise<void> {
    return apiClient.delete<void>(keyPath(key))
  },
}
