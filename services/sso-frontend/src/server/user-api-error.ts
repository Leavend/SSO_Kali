export class UserApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly violations: readonly string[]

  constructor(status: number, message: string, code: string | null = null, violations: readonly string[] = []) {
    super(message)
    this.name = 'UserApiError'
    this.status = status
    this.code = code
    this.violations = violations
  }
}

export async function buildUserApiError(response: Response): Promise<UserApiError> {
  const payload = await responsePayload(response)
  const message = payload?.message ?? fallbackMessage(response.status)
  return new UserApiError(response.status, message, payload?.code ?? null, payload?.violations ?? [])
}

export function isUserApiError(error: unknown): error is UserApiError {
  return error instanceof UserApiError || hasUserApiShape(error)
}

export function isReauthRequiredApiError(error: unknown): boolean {
  return isUserApiError(error) && error.code === 'reauth_required'
}

export function isMfaRequiredApiError(error: unknown): boolean {
  return isUserApiError(error) && error.code === 'mfa_required'
}

export function isTooManyAttemptsApiError(error: unknown): boolean {
  return isUserApiError(error) && (error.code === 'too_many_attempts' || error.status === 429)
}

type ResponsePayload = {
  readonly code: string | null
  readonly message: string | null
  readonly violations: readonly string[]
}

async function responsePayload(response: Response): Promise<ResponsePayload | null> {
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json') ? jsonPayload(response) : textPayload(response)
}

async function jsonPayload(response: Response): Promise<ResponsePayload | null> {
  const payload = (await response.json()) as unknown
  return payloadMessage(payload)
}

function payloadMessage(payload: unknown): ResponsePayload | null {
  if (!payload || typeof payload !== 'object') return null

  return {
    code: hasString(payload, 'error') ? payload.error : null,
    message: hasString(payload, 'message')
      ? payload.message
      : hasString(payload, 'error_description')
        ? payload.error_description
        : hasString(payload, 'error')
          ? payload.error
          : null,
    violations: stringList(payload, 'violations'),
  }
}

function hasString<T extends string>(payload: object, key: T): payload is Record<T, string> {
  return key in payload && typeof Reflect.get(payload, key) === 'string'
}

function stringList<T extends string>(payload: object, key: T): readonly string[] {
  const value: unknown = Reflect.get(payload, key)
  return Array.isArray(value) ? value.filter((item: unknown): item is string => typeof item === 'string') : []
}

function hasUserApiShape(error: unknown): error is UserApiError {
  if (!error || typeof error !== 'object') return false

  return (
    'status' in error
    && typeof Reflect.get(error, 'status') === 'number'
    && 'message' in error
    && typeof Reflect.get(error, 'message') === 'string'
  )
}

async function textPayload(response: Response): Promise<ResponsePayload | null> {
  const text = (await response.text()).trim()
  return text.length > 0 ? { code: null, message: text, violations: [] } : null
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Sesi SSO kedaluwarsa. Silakan masuk lagi.'
  if (status === 403) return 'Akses ke sumber daya ini tidak diizinkan.'
  if (status === 404) return 'Sumber daya tidak ditemukan.'
  if (status === 429) return 'Terlalu banyak percobaan. Coba lagi dalam beberapa saat.'
  if (status >= 500) return 'Layanan SSO sedang tidak tersedia. Silakan coba lagi.'
  return `SSO API error: ${status}`
}
