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
  return formatSupportReference(value) ?? '-'
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

export function redactTechnicalIdentifiers(message: string): string {
  return message
    .replace(REQUEST_ID_PATTERN, (_match, id: string) => {
      const ref = formatSupportReference(id)
      return ref ? `support reference ${ref}` : 'support reference'
    })
    .replace(UUID_REDACTION_PATTERN, (id) => formatSupportReference(id) ?? 'REF-AVAILABLE')
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
