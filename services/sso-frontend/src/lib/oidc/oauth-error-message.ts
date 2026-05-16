/**
 * Safe presentation copy for OAuth/OIDC protocol errors.
 *
 * FR-061 / FE-FR061-001:
 *   - Backend `error` codes map to localized safe copy held in
 *     `src/locales/<lang>.json` under the `oauth.errors.*` namespace, so
 *     copy review and translation can happen alongside every other
 *     UI string instead of in a TypeScript constant.
 *   - Backend `error_description` is technical-control text and MUST NOT
 *     be rendered to end users (may contain SQLSTATE, exception traces,
 *     attacker-controlled query parameters, etc.).
 *   - Unknown codes fall through to a generic localized message — never
 *     the raw description from the URL or backend.
 *
 * The helper accepts a plain string OR an object so call sites can pass
 * `route.query` directly without manual narrowing.
 *
 * FR-063 / FE-FR063-001:
 *   - {@link extractSupportReference} pulls `error_ref` and/or
 *     `request_id` (header or body) so the UI can offer a copyable
 *     support reference for unexpected errors.
 *   - {@link formatSupportReference} renders the localized
 *     `oauth.support_ref` template with the chosen reference.
 */

import idLocale from '@/locales/id.json'

export type OAuthErrorInput =
  | string
  | null
  | undefined
  | {
      readonly error?: unknown
      readonly error_description?: unknown
      readonly error_ref?: unknown
      readonly request_id?: unknown
    }

const LOCALE_PRIORITY: readonly string[] = ['id'] as const

const LOCALE_MESSAGES: Readonly<Record<string, unknown>> = {
  id: idLocale,
}

const KNOWN_OAUTH_ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/u

function activeLocale(): string {
  if (typeof document === 'undefined') return 'id'
  const candidate = document.documentElement.getAttribute('lang')?.toLowerCase()
  if (candidate && LOCALE_PRIORITY.includes(candidate)) return candidate
  return 'id'
}

function readNestedString(node: unknown, segments: readonly string[]): string | null {
  let current: unknown = node
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' && current.length > 0 ? current : null
}

function localized(path: string, fallback: string): string {
  const segments = path.split('.')
  for (const locale of [activeLocale(), ...LOCALE_PRIORITY]) {
    const messages = LOCALE_MESSAGES[locale]
    if (!messages) continue
    const resolved = readNestedString(messages, segments)
    if (resolved !== null) return resolved
  }
  return fallback
}

/**
 * Resolve safe copy for an OAuth error code or `{error, error_description}` pair.
 *
 * Always returns a non-empty string. Never returns the raw description.
 */
export function resolveOAuthErrorMessage(input: OAuthErrorInput): string {
  const generic = localized(
    'oauth.errors._generic',
    'Login tidak dapat diselesaikan. Mulai ulang dari halaman login atau kembali ke aplikasi awal.',
  )

  const code = readErrorCode(input)
  if (code === null) return generic

  return localized(`oauth.errors.${code}`, generic)
}

/**
 * Like {@link resolveOAuthErrorMessage}, but discloses the raw error_description
 * only when running in a non-production debug build (Vite `import.meta.env.DEV`).
 *
 * Production must call {@link resolveOAuthErrorMessage} directly. This variant
 * exists to keep developer tooling helpful without leaking technical text in prod.
 */
export function resolveOAuthErrorMessageForDev(input: OAuthErrorInput): string {
  const safe = resolveOAuthErrorMessage(input)

  if (!isDev()) return safe

  const description = readDescription(input)
  return description ? `${safe} [DEV: ${description}]` : safe
}

/**
 * Extract a copyable reference identifier (`error_ref` or `request_id`) from
 * a backend error payload. Headers take precedence over body fields when
 * `headers` is supplied. Returns null when no reference is present.
 */
export function extractSupportReference(
  input: OAuthErrorInput,
  headers?: Headers | Record<string, string | undefined> | null,
): string | null {
  const fromHeader = readHeader(headers, 'X-Error-Ref') ?? readHeader(headers, 'X-Request-Id')
  if (fromHeader !== null) return fromHeader

  if (input === null || input === undefined || typeof input === 'string') return null

  const errorRef = readReferenceField(input.error_ref)
  if (errorRef !== null) return errorRef

  return readReferenceField(input.request_id)
}

/**
 * Render the localized support-reference line. Returns null when no
 * reference is available so callers can hide the line entirely.
 */
export function formatSupportReference(reference: string | null): string | null {
  if (reference === null || reference.length === 0) return null
  const template = localized('oauth.support_ref', 'Kode dukungan: {ref}')
  return template.replaceAll('{ref}', reference)
}

function readErrorCode(input: OAuthErrorInput): string | null {
  if (input === null || input === undefined) return null

  if (typeof input === 'string') return normalizeCode(input)

  return normalizeCode(input.error)
}

function readDescription(input: OAuthErrorInput): string | null {
  if (input === null || input === undefined || typeof input === 'string') return null

  const description = input.error_description
  return typeof description === 'string' && description.length > 0 ? description : null
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().toLowerCase()
  if (trimmed.length === 0) return null
  if (!KNOWN_OAUTH_ERROR_CODE.test(trimmed)) return null

  return trimmed
}

function readReferenceField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 128) return null
  return trimmed
}

function readHeader(
  headers: Headers | Record<string, string | undefined> | null | undefined,
  name: string,
): string | null {
  if (!headers) return null
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return readReferenceField(headers.get(name))
  }
  const lookup = (headers as Record<string, string | undefined>)[name]
  return readReferenceField(lookup)
}

function isDev(): boolean {
  // Vite injects DEV/PROD; guard for non-Vite test runners that still
  // import this module (Node smoke checks).
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  } catch {
    return false
  }
}
