import type { ClientCreatePayload } from '../types'

export type ClientType = 'public' | 'confidential'

export type ClientCreateForm = {
  clientId: string
  displayName: string
  ownerEmail: string
  redirectUri: string
  backchannelLogoutUri: string
  clientType: ClientType | null
  scopes: string
}

export type ClientCreateErrors = Partial<Record<keyof ClientCreateForm, string>>

export function initialClientCreateForm(): ClientCreateForm {
  return {
    clientId: '',
    displayName: '',
    ownerEmail: '',
    redirectUri: '',
    backchannelLogoutUri: '',
    clientType: null,
    scopes: 'openid\nprofile\nemail',
  }
}

export function validateClientCreateForm(form: ClientCreateForm): ClientCreateErrors {
  const errors: ClientCreateErrors = {}
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/u.test(form.clientId.trim())) {
    errors.clientId = 'clients.validation_client_id'
  }
  if (form.clientType === null) {
    errors.clientType = 'clients.validation_client_type'
  }
  if (form.displayName.trim() === '') errors.displayName = 'clients.validation_display_name'
  if (!isEmail(form.ownerEmail)) errors.ownerEmail = 'clients.validation_owner_email'
  if (!isRedirectUri(form.redirectUri)) errors.redirectUri = 'clients.validation_redirect_uri'
  if (!isCompatibleLogoutUri(form.redirectUri, form.backchannelLogoutUri)) {
    errors.backchannelLogoutUri = 'clients.validation_logout_uri'
  }
  const scopes = parseScopes(form.scopes)
  if (scopes.length === 0 || !scopes.includes('openid')) {
    errors.scopes = 'clients.validation_scopes'
  }
  return errors
}

export function toClientCreatePayload(form: ClientCreateForm): ClientCreatePayload {
  if (form.clientType === null) {
    throw new Error('Client type must be selected before submitting.')
  }

  const redirect = new URL(form.redirectUri.trim())
  const logoutPath = form.backchannelLogoutUri.trim()
    ? new URL(form.backchannelLogoutUri.trim()).pathname
    : '/auth/backchannel/logout'

  return {
    app_name: form.displayName.trim(),
    client_id: form.clientId.trim(),
    environment: 'development',
    client_type: form.clientType,
    app_base_url: redirect.origin,
    callback_path: redirect.pathname,
    logout_path: logoutPath,
    owner_email: form.ownerEmail.trim(),
    provisioning: 'jit',
    allowed_scopes: parseScopes(form.scopes),
  }
}

export function parseScopes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/u)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ]
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim())
}

function isRedirectUri(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !value.includes('*') && url.search === ''
  } catch {
    return false
  }
}

function isCompatibleLogoutUri(redirectValue: string, logoutValue: string): boolean {
  if (logoutValue.trim() === '') return true
  if (!isRedirectUri(redirectValue) || !isRedirectUri(logoutValue)) return false

  return new URL(redirectValue.trim()).origin === new URL(logoutValue.trim()).origin
}
