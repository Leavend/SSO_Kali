const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
const UUID_REDACTION_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu
const REQUEST_ID_PATTERN = /\b(?:request|correlation)\s+ID\s+([a-z0-9][a-z0-9_:.@/-]{5,127})/giu
const ACRONYM_LABELS: Readonly<Record<string, string>> = {
  api: 'API',
  mfa: 'MFA',
  oauth: 'OAuth',
  oidc: 'OIDC',
  rp: 'RP',
  sso: 'SSO',
}

export function formatSupportReference(value: string | null | undefined): string | null {
  const normalized = normalizeReference(value)
  if (!normalized) return null
  return `REF-${normalized.slice(-8)}`
}

export function formatTechnicalPreview(value: string | null | undefined): string {
  const ref = formatSupportReference(value)
  return ref ?? '-'
}

export function formatFriendlyClientName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '-'
  if (UUID_PATTERN.test(trimmed)) return formatTechnicalPreview(trimmed)
  return trimmed
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map(humanizeIdentifierPart)
    .join(' ')
}

import { ApiError, getLastRequestId } from '@/lib/api/api-client'
import { translate } from '@/composables/useI18n'

export function isAdminProxyTransportFailure(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'admin_proxy_failed'
}

/**
 * Resolve a localized transport-failure message using i18n keys.
 * Works outside Vue setup context via module-level `translate`.
 * Returns null only when both the key and template are absent (the ?. fallback).
 */
export function resolveTransportErrorMessage(requestId: string | null | undefined): string | null {
  const ref = formatSupportReference(requestId)
  if (ref) {
    return translate('audit.transport_error', { ref }) || null
  }
  return translate('audit.transport_error_no_ref') || null
}

export function formatTransportErrorMessage(
  requestId: string | null | undefined,
  localizedMessage?: string,
): string | null {
  const ref = formatSupportReference(requestId)

  if (localizedMessage) {
    if (ref) return localizedMessage.replace('{ref}', ref)
    // When there's no reference code, just remove the {ref} placeholder.
    return localizedMessage.replace('{ref}', '').trim() || null
  }

  // Default: use i18n-aware localized message.
  return resolveTransportErrorMessage(requestId)
}

export function formatSectionError(
  label: string,
  error: unknown,
  customRequestId?: string | null,
  transportMessageTemplate?: string,
): string {
  const status = error instanceof ApiError ? error.status : null
  const reqId =
    error instanceof ApiError
      ? (error.requestId ?? getLastRequestId())
      : (customRequestId ?? getLastRequestId())

  // Transport failures (admin_proxy_failed): use specific copy, not "investigasi".
  if (isAdminProxyTransportFailure(error)) {
    return formatTransportErrorMessage(reqId, transportMessageTemplate) ?? `${label} gagal dimuat.`
  }

  const ref = formatSupportReference(reqId)

  if (status === 401) {
    return 'Sesi admin berakhir. Login ulang untuk melanjutkan.'
  }
  if (status === 403) {
    let lowerLabel = label
    if (label === 'Audit log events') lowerLabel = 'audit log events'
    if (label === 'Integritas hash chain') lowerLabel = 'integritas hash chain'
    if (label === 'Status retensi') lowerLabel = 'status retensi'
    if (label === 'Data subject requests') lowerLabel = 'data subject requests'
    if (label === 'Authentication events') lowerLabel = 'authentication events'
    if (label === 'Ops evidence') lowerLabel = 'ops evidence'
    if (label === 'Sessions admin') lowerLabel = 'sessions admin'
    if (label === 'policy/RBAC admin' || label === 'Policy/RBAC admin')
      lowerLabel = 'policy/RBAC admin'
    return `Kamu tidak memiliki izin untuk melihat ${lowerLabel}.`
  }

  const statusSuffix = status ? ` (HTTP ${status})` : ''
  const refMessage = ref ? `. Gunakan kode referensi ${ref} untuk investigasi.` : '.'

  return `${label} gagal dimuat${statusSuffix}${refMessage}`
}

export function redactTechnicalIdentifiers(message: string): string {
  return message
    .replace(REQUEST_ID_PATTERN, (_match, id: string) => {
      const ref = formatSupportReference(id)
      return ref ? `kode referensi ${ref}` : 'kode referensi'
    })
    .replace(UUID_REDACTION_PATTERN, (id) => formatSupportReference(id) ?? 'REF-TERSEDIA')
}

function normalizeReference(value: string | null | undefined): string | null {
  const chars =
    value
      ?.trim()
      .match(/[a-z0-9]/giu)
      ?.join('')
      .toUpperCase() ?? ''
  return chars.length > 0 ? chars : null
}

function humanizeIdentifierPart(part: string): string {
  const acronym = ACRONYM_LABELS[part.toLowerCase()]
  if (acronym) return acronym
  return part.charAt(0).toUpperCase() + part.slice(1)
}
