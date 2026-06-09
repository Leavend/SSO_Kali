const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
const ACRONYM_LABELS: Readonly<Record<string, string>> = {
  api: 'API',
  mfa: 'MFA',
  oauth: 'OAuth',
  oidc: 'OIDC',
  rp: 'RP',
  sso: 'SSO',
}

export function formatSupportReference(value: string | null | undefined): string | null {
  const normalized = value?.trim().match(/[a-z0-9]/giu)?.join('').toUpperCase() ?? ''
  if (!normalized) return null
  return `REF-${normalized.slice(-8)}`
}

export function formatFriendlyClientName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '-'
  if (UUID_PATTERN.test(trimmed)) return formatSupportReference(trimmed) ?? '-'
  return trimmed
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map(humanizeIdentifierPart)
    .join(' ')
}

function humanizeIdentifierPart(part: string): string {
  const acronym = ACRONYM_LABELS[part.toLowerCase()]
  if (acronym) return acronym
  return part.charAt(0).toUpperCase() + part.slice(1)
}
