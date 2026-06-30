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
  // The backend index filters to a single locale (`?locale`, default 'id'). Pass
  // an explicit locale so the caller controls which variant it gets; the query
  // param wins over the Accept-Language header the api client also sends.
  list(locale?: SsoErrorTemplateLocale): Promise<SsoErrorTemplatesResponse> {
    const path = locale ? `${BASE}?locale=${locale}` : BASE
    return apiClient.get<SsoErrorTemplatesResponse>(path)
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
