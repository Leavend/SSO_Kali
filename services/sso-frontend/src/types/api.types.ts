/**
 * API layer types — error/violation shape kontrak Laravel.
 */

export type ApiViolation = {
  readonly field: string
  readonly message: string
}

export type ApiValidationPayload = {
  readonly message?: string
  readonly code?: string
  readonly errors?: Record<string, string[] | string>
  readonly violations?: Record<string, string[] | string>
  readonly error?: string
  readonly error_description?: string
}
