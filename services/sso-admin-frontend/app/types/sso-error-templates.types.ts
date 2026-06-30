export type SsoErrorTemplateLocale = 'id' | 'en'

export interface SsoErrorTemplate {
  readonly error_code: string
  readonly locale: string
  readonly title: string
  readonly message: string
  readonly action_label: string
  readonly action_url: string | null
  readonly retry_allowed: boolean
  readonly alternative_login_allowed: boolean
  readonly is_enabled: boolean
}

export interface SsoErrorTemplatesResponse {
  readonly templates: readonly SsoErrorTemplate[]
}

export interface SsoErrorTemplateResponse {
  readonly template: SsoErrorTemplate
}

export interface UpsertSsoErrorTemplatePayload {
  readonly locale: SsoErrorTemplateLocale
  readonly title: string
  readonly message: string
  readonly action_label: string
  readonly action_url: string | null
  readonly retry_allowed: boolean
  readonly alternative_login_allowed: boolean
  readonly is_enabled: boolean
}
