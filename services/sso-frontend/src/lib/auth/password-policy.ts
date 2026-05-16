const MIN_PASSWORD_LENGTH = 12

export function passwordStrengthHints(value: string): readonly string[] {
  const hints: string[] = []
  if (value.length < MIN_PASSWORD_LENGTH) hints.push('Minimal 12 karakter')
  if (!/[A-Z]/u.test(value)) hints.push('Huruf besar')
  if (!/[a-z]/u.test(value)) hints.push('Huruf kecil')
  if (!/[0-9]/u.test(value)) hints.push('Angka')
  if (!/[^A-Za-z0-9]/u.test(value)) hints.push('Karakter spesial')
  return hints
}

export function validatePasswordFields(
  password: string,
  confirmation: string,
  passwordField: 'new_password' | 'password',
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (passwordStrengthHints(password).length > 0) {
    errors[passwordField] = 'Password belum memenuhi kebijakan keamanan.'
  }
  if (password !== confirmation) {
    errors['password_confirmation'] = 'Konfirmasi password baru tidak cocok.'
  }
  return errors
}
