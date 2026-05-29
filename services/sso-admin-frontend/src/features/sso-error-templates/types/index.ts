export interface SsoErrorTemplate {
  error_code: string
  locale: string
  title: string
  message: string
  action_label: string
  action_url: string | null
  retry_allowed: boolean
  alternative_login_allowed: boolean
  is_enabled: boolean
}

export interface SsoErrorTemplatesResponse {
  templates: readonly SsoErrorTemplate[]
}

export interface SsoErrorTemplateResponse {
  template: SsoErrorTemplate
}

export interface UpsertSsoErrorTemplatePayload {
  locale: 'id' | 'en'
  title: string
  message: string
  action_label: string
  action_url: string | null
  retry_allowed: boolean
  alternative_login_allowed: boolean
  is_enabled: boolean
}
