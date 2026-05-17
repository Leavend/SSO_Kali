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
  if (!isApiError(error)) return { message: fallbackMessage, supportReference: null }

  return {
    message: safeMessage(error),
    supportReference: error.supportReference(),
  }
}

export function validationErrors(error: unknown): Record<string, string> {
  if (!isValidationError(error) || !(error instanceof ApiError)) return {}
  return error.violationsByField()
}

export function supportReferenceCopy(reference: string | null): string | null {
  return reference ? `Kode dukungan: ${reference}` : null
}

function safeMessage(error: ApiError): string {
  return looksTechnical(error.message) ? fallbackStatusMessage(error.status) : error.message
}

function fallbackStatusMessage(status: number): string {
  if (status === 401) return 'Sesi SSO kedaluwarsa.'
  if (status === 403) return 'Akses ditolak.'
  if (status === 419) return 'Sesi keamanan kedaluwarsa.'
  if (status === 422) return 'Data tidak valid.'
  if (status === 429) return 'Terlalu banyak permintaan. Coba lagi nanti.'
  if (status >= 500) return 'Layanan SSO sedang tidak tersedia.'
  return DEFAULT_MESSAGE
}

function looksTechnical(message: string): boolean {
  return /SQLSTATE\[/i.test(message) || /Stack trace:/i.test(message) || /PDOException/i.test(message)
}
