import { ApiError, isApiError, isValidationError } from './api-error'

export type SafeErrorPresentation = {
  readonly message: string
  readonly supportReference: string | null
}

const DEFAULT_MESSAGE = 'Permintaan gagal diproses. Coba lagi beberapa saat.'

export function presentSafeError(
  error: unknown,
  fallbackMessage = DEFAULT_MESSAGE,
): SafeErrorPresentation {
  if (isApiError(error)) {
    return {
      message: error.message,
      supportReference: error.supportReference(),
    }
  }

  return {
    message: fallbackMessage,
    supportReference: null,
  }
}

export function validationErrors(error: unknown): Record<string, string> {
  if (!isValidationError(error) || !(error instanceof ApiError)) return {}
  return error.violationsByField()
}

export function supportReferenceCopy(reference: string | null): string | null {
  return reference ? `Kode dukungan: ${reference}` : null
}
