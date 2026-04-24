export class AdminApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

export async function buildAdminApiError(response: Response): Promise<AdminApiError> {
  const payload = await responsePayload(response)
  const message = payload?.message ?? fallbackMessage(response.status)
  return new AdminApiError(response.status, message, payload?.code ?? null)
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError || hasAdminApiShape(error)
}

export function isReauthRequiredApiError(error: unknown): boolean {
  return isAdminApiError(error) && error.code === 'reauth_required'
}

export function isMfaRequiredApiError(error: unknown): boolean {
  return isAdminApiError(error) && error.code === 'mfa_required'
}

export function isTooManyAttemptsApiError(error: unknown): boolean {
  return isAdminApiError(error) && (error.code === 'too_many_attempts' || error.status === 429)
}

type ResponsePayload = {
  readonly code: string | null
  readonly message: string | null
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
  }
}

function hasString<T extends string>(payload: object, key: T): payload is Record<T, string> {
  return key in payload && typeof Reflect.get(payload, key) === 'string'
}

function hasAdminApiShape(error: unknown): error is AdminApiError {
  if (!error || typeof error !== 'object') return false

  return (
    'status' in error &&
    typeof Reflect.get(error, 'status') === 'number' &&
    'message' in error &&
    typeof Reflect.get(error, 'message') === 'string'
  )
}

async function textPayload(response: Response): Promise<ResponsePayload | null> {
  const text = (await response.text()).trim()
  return text.length > 0 ? { code: null, message: text } : null
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Your admin session expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to access this admin resource.'
  if (status === 404) return 'The requested admin resource could not be found.'
  if (status === 429) return 'Too many attempts were detected. Please wait a moment before trying again.'
  if (status >= 500) return 'The admin API is temporarily unavailable. Please try again.'
  return `Admin API error: ${status}`
}
