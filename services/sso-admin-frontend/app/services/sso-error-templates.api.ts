import { apiClient } from '@/lib/api/api-client'
import type {
  SsoErrorTemplateLocale,
  SsoErrorTemplateResponse,
  SsoErrorTemplatesResponse,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'

const BASE = '/api/admin/sso-error-templates'

// error_code is a fixed catalog key (backend route param [a-z_]+), not user
// free-text, but encode it defensively before interpolation.
export const ssoErrorTemplatesApi = {
  list(): Promise<SsoErrorTemplatesResponse> {
    return apiClient.get<SsoErrorTemplatesResponse>(BASE)
  },
  update(
    errorCode: string,
    payload: UpsertSsoErrorTemplatePayload,
  ): Promise<SsoErrorTemplateResponse> {
    return apiClient.patch<SsoErrorTemplateResponse>(
      `${BASE}/${encodeURIComponent(errorCode)}`,
      payload,
    )
  },
  reset(errorCode: string, locale: SsoErrorTemplateLocale): Promise<SsoErrorTemplateResponse> {
    return apiClient.post<SsoErrorTemplateResponse>(
      `${BASE}/${encodeURIComponent(errorCode)}/reset`,
      { locale },
    )
  },
}
