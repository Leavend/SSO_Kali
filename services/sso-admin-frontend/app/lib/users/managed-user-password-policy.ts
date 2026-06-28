// Pure password-policy checklist for the create / sync-profile forms. Ported
// from the legacy admin SPA, plus an explicit max-length requirement so the
// 128-char ceiling reads as a checklist item rather than a silent failure.
// No Nuxt, no network — labels are resolved by the form via i18n keyed on `id`.

export type PasswordRequirementId =
  | 'min_length'
  | 'uppercase'
  | 'lowercase'
  | 'number'
  | 'symbol'
  | 'max_length'

export type PasswordRequirement = {
  readonly id: PasswordRequirementId
  readonly met: boolean
}

export function evaluateManagedUserPassword(password: string): readonly PasswordRequirement[] {
  return [
    { id: 'min_length', met: password.length >= 12 },
    { id: 'uppercase', met: /[A-Z]/u.test(password) },
    { id: 'lowercase', met: /[a-z]/u.test(password) },
    { id: 'number', met: /[0-9]/u.test(password) },
    { id: 'symbol', met: /[^A-Za-z0-9]/u.test(password) },
    { id: 'max_length', met: password.length <= 128 },
  ]
}

// Password is OPTIONAL (gated by the local-account toggle): an empty string is
// valid. A non-empty password must satisfy every requirement, including the
// max-length ceiling.
export function isManagedUserPasswordValid(password: string): boolean {
  if (password === '') return true
  return evaluateManagedUserPassword(password).every((requirement) => requirement.met)
}
