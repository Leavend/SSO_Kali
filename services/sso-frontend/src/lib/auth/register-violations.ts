/**
 * register-violations — translates raw 422 violation messages from
 * `/api/auth/register` into user-facing Indonesian copy. Lives outside
 * RegisterPage so the page stays an orchestrator (standart-quality-code §1.1)
 * and so the mapping can be unit-tested without mounting the page.
 *
 * The mapping is intentionally explicit (no regex catch-all) for known
 * violations. Anything we don't recognise is folded into the generic
 * "Data tidak valid." copy, never echoed back to the user — protecting us
 * from leaking internal validation strings (TDD-standart-prod §6 / §13.3).
 */

const ERROR_TRANSLATIONS: Readonly<Record<string, string>> = {
  'The email has already been taken.': 'Email ini sudah terdaftar.',
  'The name field is required.': 'Nama lengkap wajib diisi.',
  'The email field is required.': 'Email wajib diisi.',
  'The email field must be a valid email address.': 'Format email tidak valid.',
  'The password field is required.': 'Password wajib diisi.',
  'The password field confirmation does not match.': 'Konfirmasi password tidak cocok.',
  'The password confirmation does not match.': 'Konfirmasi password tidak cocok.',
  'Password ini pernah muncul dalam kebocoran data; pilih yang lain.':
    'Password ini pernah muncul dalam kebocoran data; pilih yang lain.',
  'The route api/auth/register could not be found.':
    'Fitur pendaftaran belum tersedia. Hubungi administrator.',
  'Not Found': 'Fitur pendaftaran belum tersedia. Hubungi administrator.',
}

const PASSWORD_MIN_LENGTH_PATTERN = /at least \d+ characters?/i

/**
 * Translate a single backend violation message to safe Indonesian copy.
 *
 * @param message Raw violation string from `ApiError.violations[].message`.
 * @returns Indonesian copy. Falls back to "Data tidak valid." for unknowns.
 */
export function translateRegisterViolation(message: string): string {
  const known = ERROR_TRANSLATIONS[message]
  if (known) return known
  if (PASSWORD_MIN_LENGTH_PATTERN.test(message)) {
    return 'Password belum memenuhi kebijakan keamanan (minimal 12 karakter, huruf besar, huruf kecil, angka, karakter spesial, dan tidak pernah muncul dalam kebocoran data).'
  }
  return 'Data tidak valid.'
}
