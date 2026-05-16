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
 *   - FR-061: copy untuk status/network/timeout/aborted dan pemetaan
 *     pesan known-English ke id-ID hidup di locale resources, bukan di TS.
 *   - FR-063: membawa `errorRef` dan `requestId` agar UI bisa menampilkan
 *     kode dukungan yang dapat disalin pengguna.
 *
 * Tidak menyimpan referensi Response/body asli untuk mencegah memory leak
 * dan meminimalkan bocor data sensitif ke log.
 */

import idLocale from '@/locales/id.json'
import type { ApiValidationPayload, ApiViolation } from '@/types/api.types'

export type ApiErrorKind =
  | 'http' // Response 4xx/5xx standar dari server.
  | 'network' // Fetch gagal (offline / DNS / CORS).
  | 'timeout' // AbortController timeout trigger.
  | 'aborted' // Caller membatalkan.
  | 'parse' // Body tidak dapat di-parse saat fallback.

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly violations: readonly ApiViolation[]
  readonly kind: ApiErrorKind
  readonly retryAfterSeconds: number | null
  readonly errorRef: string | null
  readonly requestId: string | null

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    violations: readonly ApiViolation[] = [],
    kind: ApiErrorKind = 'http',
    retryAfterSeconds: number | null = null,
    errorRef: string | null = null,
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.violations = violations
    this.kind = kind
    this.retryAfterSeconds = retryAfterSeconds
    this.errorRef = errorRef
    this.requestId = requestId
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const payload = await readErrorPayload(response)
    const headers = response.headers
    return new ApiError(
      response.status,
      payload.message ?? fallbackMessage(response.status),
      payload.code,
      payload.violations,
      'http',
      readRetryAfterSeconds(headers.get('retry-after')),
      readReference(payload.errorRef ?? headers.get('x-error-ref')),
      readReference(payload.requestId ?? headers.get('x-request-id')),
    )
  }

  static fromNetworkError(error: unknown): ApiError {
    const reason = error instanceof Error ? error.message : String(error)
    return new ApiError(
      0,
      localized('api.network_error', 'Tidak dapat menghubungi server SSO.'),
      'network_error',
      [],
      'network',
    ).withCause(reason)
  }

  static fromTimeout(): ApiError {
    return new ApiError(
      0,
      localized('api.timeout', 'Permintaan ke server terlalu lama. Coba lagi.'),
      'timeout',
      [],
      'timeout',
    )
  }

  static fromAbort(): ApiError {
    return new ApiError(
      0,
      localized('api.aborted', 'Permintaan dibatalkan.'),
      'aborted',
      [],
      'aborted',
    )
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
   * Reference identifier yang dapat disalin user untuk dukungan.
   * Mengembalikan `errorRef` jika tersedia, lalu `requestId`.
   */
  supportReference(): string | null {
    return this.errorRef ?? this.requestId
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
  readonly errorRef: string | null
  readonly requestId: string | null
}

async function readErrorPayload(response: Response): Promise<ParsedPayload> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return { code: null, message: null, violations: [], errorRef: null, requestId: null }
  }

  const raw = (await response
    .json()
    .catch((): ApiValidationPayload | null => null)) as ApiValidationPayload | null
  if (!raw) return { code: null, message: null, violations: [], errorRef: null, requestId: null }

  return {
    code: readString(raw.error) ?? readString(raw.code),
    message: localizeMessage(
      readString(raw.message) ?? readString(raw.error_description),
      response.status,
    ),
    violations: readViolations(raw.errors) ?? readViolations(raw.violations) ?? [],
    errorRef: readReference(raw.error_ref),
    requestId: readReference(raw.request_id),
  }
}

function localizeMessage(message: string | null, status: number): string | null {
  if (!message) return null
  const direct = readNestedString(idLocale, ['api', 'messages', message])
  if (direct !== null) return direct

  const patterns = readNested(idLocale, ['api', 'patterns']) as Record<string, unknown> | null
  if (patterns && typeof patterns === 'object') {
    for (const [needle, replacement] of Object.entries(patterns)) {
      if (typeof needle === 'string' && needle.length > 0 && message.includes(needle)) {
        if (typeof replacement === 'string' && replacement.length > 0) return replacement
      }
    }
  }

  if (looksTechnical(message)) {
    return fallbackMessage(status)
  }

  return message
}

function looksTechnical(message: string): boolean {
  return (
    /SQLSTATE\[/i.test(message) ||
    /Stack trace:/i.test(message) ||
    /\\[A-Z][A-Za-z0-9_]+::/.test(message) ||
    /^#\d+\s/m.test(message) ||
    /PDOException/i.test(message)
  )
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readReference(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 128) return null
  return trimmed
}

function readRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null
  const seconds = Number.parseInt(value, 10)
  if (Number.isFinite(seconds) && seconds > 0) return seconds

  const retryAt = Date.parse(value)
  if (!Number.isFinite(retryAt)) return null

  return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
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
  if (status === 400) return localized('api.status_400', 'Permintaan tidak valid.')
  if (status === 401) return localized('api.status_401', 'Sesi SSO kedaluwarsa.')
  if (status === 403) return localized('api.status_403', 'Akses ditolak.')
  if (status === 404) return localized('api.status_404', 'Sumber daya tidak ditemukan.')
  if (status === 408) return localized('api.status_408', 'Server terlalu lama merespons.')
  if (status === 409) return localized('api.status_409', 'Terjadi konflik data.')
  if (status === 419) return localized('api.status_419', 'Sesi keamanan kedaluwarsa.')
  if (status === 422) return localized('api.status_422', 'Data tidak valid.')
  if (status === 429) return localized('api.status_429', 'Terlalu banyak percobaan.')
  if (status >= 500) return localized('api.status_5xx', 'Layanan SSO sedang tidak tersedia.')
  const generic = localized('api.status_generic', 'Permintaan gagal dengan status {status}.')
  return generic.replaceAll('{status}', String(status))
}

function localized(path: string, fallback: string): string {
  const resolved = readNestedString(idLocale, path.split('.'))
  return resolved ?? fallback
}

function readNested(node: unknown, segments: readonly string[]): unknown {
  let current: unknown = node
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function readNestedString(node: unknown, segments: readonly string[]): string | null {
  const value = readNested(node, segments)
  return typeof value === 'string' && value.length > 0 ? value : null
}
