/**
 * Safe presentation copy for OAuth/OIDC protocol errors.
 *
 * FR-028 / FE-FR028-001:
 *   - Backend `error` codes map to localized safe copy.
 *   - Backend `error_description` is technical-control text and MUST NOT
 *     be rendered to end users (may contain SQLSTATE, exception traces,
 *     attacker-controlled query parameters, etc.).
 *   - Unknown codes fall through to a generic message — never the raw
 *     description from the URL or backend.
 *
 * The helper accepts a plain string OR an object so call sites can pass
 * `route.query` directly without manual narrowing.
 */

export type OAuthErrorInput =
  | string
  | null
  | undefined
  | {
      readonly error?: unknown
      readonly error_description?: unknown
    }

const OAUTH_ERROR_COPY: Record<string, string> = {
  // OAuth 2.0 RFC 6749 §4.1.2.1
  invalid_request: 'Permintaan otorisasi tidak valid. Mulai ulang dari halaman login.',
  unauthorized_client: 'Aplikasi ini tidak diizinkan menggunakan SSO. Hubungi administrator.',
  access_denied: 'Permintaan akses ditolak. Coba lagi atau kembali ke aplikasi awal.',
  unsupported_response_type:
    'Mode otorisasi tidak didukung. Mulai ulang dari halaman login.',
  invalid_scope: 'Cakupan izin yang diminta tidak valid. Hubungi administrator aplikasi.',
  server_error: 'Terjadi kesalahan di server SSO. Coba lagi beberapa saat.',
  temporarily_unavailable:
    'Layanan SSO sedang sibuk. Coba lagi beberapa saat.',
  // OIDC Core 1.0 §3.1.2.6
  interaction_required:
    'Tindakan tambahan diperlukan untuk melanjutkan login. Coba lagi tanpa prompt=none.',
  login_required: 'Sesi SSO sudah berakhir. Silakan masuk lagi untuk melanjutkan.',
  account_selection_required:
    'Silakan pilih akun yang akan digunakan, lalu coba lagi.',
  consent_required:
    'Persetujuan akses dibutuhkan. Lanjutkan ke halaman persetujuan untuk melanjutkan.',
  invalid_request_uri:
    'Permintaan otorisasi tidak valid. Mulai ulang dari halaman login.',
  invalid_request_object:
    'Permintaan otorisasi tidak valid. Mulai ulang dari halaman login.',
  request_not_supported:
    'Mode permintaan ini tidak didukung. Mulai ulang dari halaman login.',
  request_uri_not_supported:
    'Mode permintaan ini tidak didukung. Mulai ulang dari halaman login.',
  registration_not_supported:
    'Pendaftaran client tidak didukung. Hubungi administrator.',
  // SSO-specific (BE-FR020-001 / BE-FR021-001 / BE-FR023-001)
  mfa_enrollment_required:
    'Aplikasi ini membutuhkan autentikasi multi-faktor. Aktifkan MFA pada akunmu lalu coba lagi.',
  mfa_reenrollment_required:
    'Akun kamu telah direset oleh admin. Aktifkan kembali autentikasi multi-faktor (MFA) sebelum melanjutkan.',
}

const GENERIC_OAUTH_FAILURE =
  'Login tidak dapat diselesaikan. Mulai ulang dari halaman login atau kembali ke aplikasi awal.'

const KNOWN_OAUTH_ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/u

/**
 * Resolve safe copy for an OAuth error code or `{error, error_description}` pair.
 *
 * Always returns a non-empty string. Never returns the raw description.
 */
export function resolveOAuthErrorMessage(input: OAuthErrorInput): string {
  const code = readErrorCode(input)
  if (code === null) return GENERIC_OAUTH_FAILURE

  return OAUTH_ERROR_COPY[code] ?? GENERIC_OAUTH_FAILURE
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

function isDev(): boolean {
  // Vite injects DEV/PROD; guard for non-Vite test runners that still
  // import this module (Node smoke checks).
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  } catch {
    return false
  }
}
