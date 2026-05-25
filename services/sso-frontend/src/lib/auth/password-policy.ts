export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'strong'

export interface PasswordRequirementStatus {
  readonly id: string
  readonly label: string
  readonly met: boolean
}

export interface PasswordStrengthSummary {
  readonly score: number
  readonly percentage: number
  readonly level: PasswordStrengthLevel
  readonly label: string
  readonly items: readonly PasswordRequirementStatus[]
  readonly hints: readonly string[]
}

const MIN_PASSWORD_LENGTH = 12

export function passwordRequirementStatuses(
  password: string,
): readonly PasswordRequirementStatus[] {
  return [
    {
      id: 'length',
      label: `Minimal ${MIN_PASSWORD_LENGTH} karakter`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    { id: 'uppercase', label: 'Memiliki huruf besar', met: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'Memiliki huruf kecil', met: /[a-z]/.test(password) },
    { id: 'number', label: 'Memiliki angka', met: /\d/.test(password) },
    { id: 'symbol', label: 'Karakter spesial', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

export const passwordRequirementStatus = passwordRequirementStatuses

export function passwordStrengthHints(password: string): readonly string[] {
  return passwordRequirementStatuses(password)
    .filter((item) => !item.met)
    .map((item) => item.label)
}

export function passwordStrengthSummary(password: string): PasswordStrengthSummary {
  const items = passwordRequirementStatuses(password)
  const score = items.filter((item) => item.met).length
  const percentage = Math.round((score / items.length) * 100)
  const level: PasswordStrengthLevel =
    password.length === 0 ? 'empty' : score <= 2 ? 'weak' : score <= 4 ? 'fair' : 'strong'
  const label =
    level === 'empty'
      ? 'Mulai mengetik untuk melihat kekuatan password'
      : level === 'weak'
        ? 'Lemah'
        : level === 'fair'
          ? 'Cukup kuat'
          : 'Kuat'
  return { score, percentage, level, label, items, hints: passwordStrengthHints(password) }
}

export function validatePasswordFields(
  password: string,
  confirmation: string,
  fieldName = 'password',
): Record<string, string> {
  const errors: Record<string, string> = {}
  const hints = passwordStrengthHints(password)

  if (hints.length > 0) {
    errors[fieldName] = 'Password belum memenuhi kebijakan keamanan: ' + hints.join(', ') + '.'
  }
  if (password !== confirmation) {
    errors[`${fieldName}_confirmation`] = 'Konfirmasi password tidak cocok.'
  }

  return errors
}
