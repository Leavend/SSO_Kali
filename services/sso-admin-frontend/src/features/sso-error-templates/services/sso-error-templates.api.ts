import { apiClient } from '@/lib/api/api-client'
import type {
  SsoErrorTemplatesResponse,
  SsoErrorTemplateResponse,
  UpsertSsoErrorTemplatePayload,
} from '../types'

export const ssoErrorTemplatesApi = {
  list(): Promise<SsoErrorTemplatesResponse> {
    return apiClient.get<SsoErrorTemplatesResponse>('/api/admin/sso-error-templates')
  },
  get(errorCode: string, locale?: string): Promise<SsoErrorTemplateResponse> {
    return apiClient.get<SsoErrorTemplateResponse>(
      `/api/admin/sso-error-templates/${encodeURIComponent(errorCode)}`,
      { headers: locale ? { 'Accept-Language': locale } : undefined },
    )
  },
  update(
    errorCode: string,
    payload: UpsertSsoErrorTemplatePayload,
  ): Promise<SsoErrorTemplateResponse> {
    return apiClient.put<SsoErrorTemplateResponse>(
      `/api/admin/sso-error-templates/${encodeURIComponent(errorCode)}`,
      payload,
    )
  },
  reset(errorCode: string, locale?: string): Promise<SsoErrorTemplateResponse> {
    return apiClient.post<SsoErrorTemplateResponse>(
      `/api/admin/sso-error-templates/${encodeURIComponent(errorCode)}/reset`,
      { locale: locale ?? 'id' },
    )
  },
}
