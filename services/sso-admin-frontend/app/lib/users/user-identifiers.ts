// Pure identifier validation + masked-PII display for the Users forms. The
// government-identifier regexes mirror the backend FormRequests EXACTLY
// (CreateManagedUserRequest / SyncManagedUserProfileRequest): nik = 16 digits,
// nip = 18 digits, nisn = 10 digits, birth_date = `date_format:Y-m-d` + a real
// date — keep them in lock-step with the backend. NIK/NIP/NISN are accepted RAW
// here for submission only; they are never rendered raw. No Nuxt, no network.

// Same shape as the legacy admin SPA email check.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

const NIK_PATTERN = /^[0-9]{16}$/u
const NIP_PATTERN = /^[0-9]{18}$/u
const NISN_PATTERN = /^[0-9]{10}$/u

export function isValidNik(value: string): boolean {
  return NIK_PATTERN.test(value)
}

export function isValidNip(value: string): boolean {
  return NIP_PATTERN.test(value)
}

export function isValidNisn(value: string): boolean {
  return NISN_PATTERN.test(value)
}

const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

// Mirrors the backend `date_format:Y-m-d` + `date` pair: the shape must match
// AND the value must be a real calendar date. The UTC round-trip rejects
// rollovers (2026-02-30 → March) and out-of-range months (2026-13-01, 2026-00-10)
// without explicit range arithmetic.
export function isValidBirthDate(value: string): boolean {
  if (!BIRTH_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day
  )
}

// The backend already masks NIK/NIP/NISN (GovernmentIdentifier) before they
// reach the SSR payload; this only guards null/empty so the UI never renders a
// bare blank cell. The value is passed through unchanged — already safe to show.
export function formatMaskedIdentifier(value: string | null | undefined): string {
  return value == null || value === '' ? '—' : value
}
