export type ManagedUserPasswordRequirement = {
  readonly id: string
  readonly labelKey: string
  readonly met: boolean
}

export function managedUserPasswordRequirements(
  password: string,
): readonly ManagedUserPasswordRequirement[] {
  return [
    { id: 'length', labelKey: 'users.password_requirement_length', met: password.length >= 12 },
    {
      id: 'uppercase',
      labelKey: 'users.password_requirement_uppercase',
      met: /[A-Z]/u.test(password),
    },
    {
      id: 'lowercase',
      labelKey: 'users.password_requirement_lowercase',
      met: /[a-z]/u.test(password),
    },
    { id: 'number', labelKey: 'users.password_requirement_number', met: /[0-9]/u.test(password) },
    {
      id: 'symbol',
      labelKey: 'users.password_requirement_symbol',
      met: /[^A-Za-z0-9]/u.test(password),
    },
  ]
}

export function isManagedUserPasswordValid(password: string): boolean {
  return (
    password === '' ||
    (password.length <= 128 &&
      managedUserPasswordRequirements(password).every((requirement) => requirement.met))
  )
}
