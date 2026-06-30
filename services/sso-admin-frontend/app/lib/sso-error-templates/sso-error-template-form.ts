import type {
  SsoErrorTemplate,
  SsoErrorTemplateLocale,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'

export type SsoErrorTemplateFormModel = {
  locale: SsoErrorTemplateLocale
  title: string
  message: string
  action_label: string
  action_url: string
  retry_allowed: boolean
  alternative_login_allowed: boolean
  is_enabled: boolean
}

// Mirror UpsertSsoErrorTemplateRequest: title max:120, message max:500,
// action_label max:80, action_url nullable url:https max:500.
const TITLE_MAX = 120
const MESSAGE_MAX = 500
const ACTION_LABEL_MAX = 80
const ACTION_URL_MAX = 500

export function validateSsoErrorTemplateForm(
  form: SsoErrorTemplateFormModel,
): { valid: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}

  const title = form.title.trim()
  if (!title) fieldErrors.title = 'required'
  else if (title.length > TITLE_MAX) fieldErrors.title = 'too_long'

  const message = form.message.trim()
  if (!message) fieldErrors.message = 'required'
  else if (message.length > MESSAGE_MAX) fieldErrors.message = 'too_long'

  const actionLabel = form.action_label.trim()
  if (!actionLabel) fieldErrors.action_label = 'required'
  else if (actionLabel.length > ACTION_LABEL_MAX) fieldErrors.action_label = 'too_long'

  // action_url is optional; only validate length + https scheme when present.
  const actionUrl = form.action_url.trim()
  if (actionUrl) {
    if (actionUrl.length > ACTION_URL_MAX) fieldErrors.action_url = 'too_long'
    else if (!isHttpsUrl(actionUrl)) fieldErrors.action_url = 'invalid_url'
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors }
}

// Backend rule is `url:https` — must parse as a URL with an https scheme.
function isHttpsUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'https:'
}

export function buildUpsertPayload(
  form: SsoErrorTemplateFormModel,
): UpsertSsoErrorTemplatePayload {
  const actionUrl = form.action_url.trim()
  return {
    locale: form.locale,
    title: form.title.trim(),
    message: form.message.trim(),
    action_label: form.action_label.trim(),
    action_url: actionUrl ? actionUrl : null,
    retry_allowed: form.retry_allowed,
    alternative_login_allowed: form.alternative_login_allowed,
    is_enabled: form.is_enabled,
  }
}

export function templateToFormModel(template: SsoErrorTemplate): SsoErrorTemplateFormModel {
  return {
    locale: template.locale === 'en' ? 'en' : 'id',
    title: template.title,
    message: template.message,
    action_label: template.action_label,
    action_url: template.action_url ?? '',
    retry_allowed: template.retry_allowed,
    alternative_login_allowed: template.alternative_login_allowed,
    is_enabled: template.is_enabled,
  }
}
