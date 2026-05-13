/**
 * ApiError — typed error untuk diskriminasi HTTP status + validation violations.
 *
 * Tanggung jawab (standart-quality-code §4 Error Handling + §11 API contract):
 *   - Turunan `Error` supaya tetap kompatibel dengan try/catch standar.
 *   - Membawa `status`, `code` (Laravel error code / OAuth2 error), `violations`
 *     (422 field errors) supaya UI dapat membranching tanpa parse ulang body.
 *   - Pattern `fromResponse()` untuk parsing idempoten JSON / text.
 *   - Predicate helpers (`isUnauthorized`, `isForbidden`, `isValidation`,
 *     `isRateLimited`, `isConflict`, `isNotFound`, `isServerError`,
 *     `isRetryable`, `isNetworkFailure`, `isTimeout`) agar call site bersih.
 *
 * Tidak menyimpan referensi Response/body asli untuk mencegah memory leak
 * dan meminimalkan bocor data sensitif ke log.
 */

import type { ApiValidationPayload, ApiViolation } from '@/types/api.types'

export type ApiErrorKind =
  | 'http'        // Response 4xx/5xx standar dari server.
  | 'network'     // Fetch gagal (offline / DNS / CORS).
  | 'timeout'     // AbortController timeout trigger.
  | 'aborted'     // Caller membatalkan.
  | 'parse'       // Body tidak dapat di-parse saat fallback.

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly violations: readonly ApiViolation[]
  readonly kind: ApiErrorKind

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    violations: readonly ApiViolation[] = [],
    kind: ApiErrorKind = 'http',
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.violations = violations
    this.kind = kind
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const payload = await readErrorPayload(response)
    return new ApiError(
      response.status,
      payload.message ?? fallbackMessage(response.status),
      payload.code,
      payload.violations,
      'http',
    )
  }

  static fromNetworkError(error: unknown): ApiError {
    const reason = error instanceof Error ? error.message : String(error)
    return new ApiError(0, 'Tidak dapat menghubungi server SSO.', 'network_error', [], 'network').withCause(reason)
  }

  static fromTimeout(): ApiError {
    return new ApiError(0, 'Permintaan ke server terlalu lama. Coba lagi.', 'timeout', [], 'timeout')
  }

  static fromAbort(): ApiError {
    return new ApiError(0, 'Permintaan dibatalkan.', 'aborted', [], 'aborted')
  }

  /**
   * Mengembalikan map violations per field — memudahkan form untuk
   * `fieldErrors[field] = message` tanpa `.reduce()` di tiap call site.
   */
  violationsByField(): Record<string, string> {
    return this.violations.reduce<Record<string, string>>((acc, item) => {
      acc[item.field] = item.message
      return acc
    }, {})
  }

  /**
   * HTTP semantic-based safe-retry. Idempoten terhadap caller.
   */
  isRetryable(): boolean {
    if (this.kind === 'timeout' || this.kind === 'network') return true
    if (this.kind !== 'http') return false
    return this.status === 408 || this.status === 429 || this.status >= 500
  }

  /**
   * Tambah cause (Node/Web compatible) tanpa melanggar immutability readonly lain.
   */
  private withCause(cause: unknown): this {
    Object.defineProperty(this, 'cause', { value: cause, enumerable: false })
    return this
  }
}

/* ---------- Predicate helpers ---------- */

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isUnauthorized(error: unknown): boolean {
  return isApiError(error) && error.status === 401
}

export function isForbidden(error: unknown): boolean {
  return isApiError(error) && error.status === 403
}

export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404
}

export function isConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409
}

export function isValidationError(error: unknown): boolean {
  return isApiError(error) && error.status === 422
}

export function isTooManyRequests(error: unknown): boolean {
  return isApiError(error) && error.status === 429
}

export function isServerError(error: unknown): boolean {
  return isApiError(error) && error.status >= 500 && error.status < 600
}

export function isNetworkFailure(error: unknown): boolean {
  return isApiError(error) && error.kind === 'network'
}

export function isTimeout(error: unknown): boolean {
  return isApiError(error) && error.kind === 'timeout'
}

export function isAbortError(error: unknown): boolean {
  return isApiError(error) && error.kind === 'aborted'
}

/* ---------- Internal parser ---------- */

type ParsedPayload = {
  readonly code: string | null
  readonly message: string | null
  readonly violations: readonly ApiViolation[]
}

async function readErrorPayload(response: Response): Promise<ParsedPayload> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    // Non-JSON response (e.g. raw HTML from nginx 503/502) — never expose to UI.
    return { code: null, message: null, violations: [] }
  }

  const raw = (await response.json().catch((): ApiValidationPayload | null => null)) as
    | ApiValidationPayload
    | null
  if (!raw) return { code: null, message: null, violations: [] }

  return {
    code: readString(raw.error) ?? readString(raw.code),
    message: localizeMessage(readString(raw.message) ?? readString(raw.error_description)),
    violations: readViolations(raw.errors) ?? readViolations(raw.violations) ?? [],
  }
}

/**
 * Map known English backend messages to Indonesian (FR-061).
 * Returns original message if no mapping found.
 */
const MESSAGE_ID_MAP: Record<string, string> = {
  'Unauthenticated.': 'Sesi SSO kedaluwarsa. Silakan masuk lagi.',
  'The bearer token is invalid.': 'Token akses tidak valid. Silakan masuk lagi.',
  'Server Error': 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.',
  'Too Many Attempts.': 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.',
  'This action is unauthorized.': 'Akses ke sumber daya ini tidak diizinkan.',
  'Not Found': 'Sumber daya tidak ditemukan.',
}

function localizeMessage(message: string | null): string | null {
  if (!message) return null
  // Check exact match first
  if (MESSAGE_ID_MAP[message]) return MESSAGE_ID_MAP[message]
  // Check pattern: "The route X could not be found."
  if (message.includes('could not be found')) return 'Sumber daya tidak ditemukan.'
  return message
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readViolations(
  value: Record<string, string[] | string> | undefined,
): readonly ApiViolation[] | null {
  if (!value) return null

  const entries: ApiViolation[] = []
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (typeof message === 'string') entries.push({ field, message })
      }
    } else if (typeof messages === 'string') {
      entries.push({ field, message: messages })
    }
  }

  return entries.length > 0 ? entries : null
}

function fallbackMessage(status: number): string {
  if (status === 400) return 'Permintaan tidak valid. Periksa data lalu coba lagi.'
  if (status === 401) return 'Sesi SSO kedaluwarsa. Silakan masuk lagi.'
  if (status === 403) return 'Akses ke sumber daya ini tidak diizinkan.'
  if (status === 404) return 'Sumber daya tidak ditemukan.'
  if (status === 408) return 'Server terlalu lama merespons. Coba lagi.'
  if (status === 409) return 'Terjadi konflik data. Muat ulang lalu coba lagi.'
  if (status === 422) return 'Data yang dikirim tidak valid.'
  if (status === 429) return 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.'
  if (status >= 500) return 'Layanan SSO sedang tidak tersedia. Coba lagi nanti.'
  return `Permintaan gagal dengan status ${status}.`
}
