import type {
  ExternalIdpCreatePayload,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

// Flat form model — the comma-separated text fields and the numeric priority are
// strings here (raw input); the payload builders normalize them.
export type ExternalIdpFormModel = {
  provider_key: string
  display_name: string
  issuer: string
  metadata_url: string
  client_id: string
  client_secret: string
  algorithms: string
  scopes: string
  priority: string
  enabled: boolean
  is_backup: boolean
  tls_validation_enabled: boolean
  signature_validation_enabled: boolean
}

const PROVIDER_KEY_RE = /^[a-z0-9_-]+$/u

export function validateProviderForm(
  form: ExternalIdpFormModel,
  mode: 'create' | 'edit',
): { valid: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  const required = (key: keyof ExternalIdpFormModel) => String(form[key]).trim().length > 0

  if (mode === 'create') {
    if (!required('provider_key')) fieldErrors.provider_key = 'required'
    else if (!PROVIDER_KEY_RE.test(form.provider_key.trim())) fieldErrors.provider_key = 'pattern'
    if (!required('display_name')) fieldErrors.display_name = 'required'
    if (!required('issuer')) fieldErrors.issuer = 'required'
    if (!required('metadata_url')) fieldErrors.metadata_url = 'required'
    if (!required('client_id')) fieldErrors.client_id = 'required'
  }

  // HTTPS is required for issuer + metadata_url whenever a value is present (both modes).
  if (form.issuer.trim() && !form.issuer.trim().startsWith('https://')) fieldErrors.issuer = 'https'
  if (form.metadata_url.trim() && !form.metadata_url.trim().startsWith('https://'))
    fieldErrors.metadata_url = 'https'

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors }
}

function splitList(value: string): readonly string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

// Backend rules: priority is `sometimes|integer|min:1`; allowed_algorithms/scopes are
// `sometimes|array|min:1`. So OMIT any of these the operator cleared (the backend keeps
// the existing value / applies its default) rather than sending 0 or [] and forcing a
// misleading 422. The happy path (defaults '100' / 'RS256' / 'openid') always includes
// them.
function optionalFields(form: ExternalIdpFormModel): {
  allowed_algorithms?: readonly string[]
  scopes?: readonly string[]
  priority?: number
} {
  const algorithms = splitList(form.algorithms)
  const scopes = splitList(form.scopes)
  const priority = form.priority.trim() ? Number(form.priority) : Number.NaN
  return {
    ...(algorithms.length ? { allowed_algorithms: algorithms } : {}),
    ...(scopes.length ? { scopes } : {}),
    ...(Number.isFinite(priority) && priority >= 1 ? { priority } : {}),
  }
}

export function buildCreatePayload(form: ExternalIdpFormModel): ExternalIdpCreatePayload {
  return {
    provider_key: form.provider_key.trim(),
    display_name: form.display_name.trim(),
    issuer: form.issuer.trim(),
    metadata_url: form.metadata_url.trim(),
    client_id: form.client_id.trim(),
    ...(form.client_secret.trim() ? { client_secret: form.client_secret } : {}),
    ...optionalFields(form),
    enabled: form.enabled,
    is_backup: form.is_backup,
  }
}

export function buildUpdatePayload(form: ExternalIdpFormModel): ExternalIdpUpdatePayload {
  return {
    display_name: form.display_name.trim(),
    metadata_url: form.metadata_url.trim(),
    client_id: form.client_id.trim(),
    ...(form.client_secret.trim() ? { client_secret: form.client_secret } : {}),
    ...optionalFields(form),
    enabled: form.enabled,
    is_backup: form.is_backup,
    tls_validation_enabled: form.tls_validation_enabled,
    signature_validation_enabled: form.signature_validation_enabled,
  }
}
