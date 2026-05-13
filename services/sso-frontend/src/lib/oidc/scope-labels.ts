/**
 * Scope registry for consent UI (FR-004 / UC-13).
 *
 * Maps OIDC scope strings to human-readable Indonesian labels and
 * descriptions. Used by `ConsentPage` to show users what a client
 * is actually requesting permission for.
 *
 * Design note:
 *   - Unknown scopes are NOT silently rendered as-is (phishing risk).
 *     Callers should use `resolveScopeLabel()` which returns an
 *     explicit unknown-scope descriptor so the UI can flag visually.
 *   - Label text is intentionally short for list rendering; the
 *     `description` field is used for expanded/tooltip details.
 *   - `level` hints risk so UI can color-code (default/standard/sensitive).
 */

export type ScopeLevel = 'standard' | 'sensitive' | 'unknown'

export type ScopeDescriptor = {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly level: ScopeLevel
}

const REGISTRY: Readonly<Record<string, Omit<ScopeDescriptor, 'name'>>> = {
  openid: {
    label: 'Identitas Dasar',
    description: 'Mengizinkan aplikasi mengetahui bahwa kamu login dengan akun SSO ini.',
    level: 'standard',
  },
  profile: {
    label: 'Profil Pengguna',
    description: 'Akses ke nama tampilan, nama depan, dan nama belakang kamu.',
    level: 'standard',
  },
  email: {
    label: 'Alamat Email',
    description: 'Akses ke alamat email dan status verifikasi email kamu.',
    level: 'standard',
  },
  offline_access: {
    label: 'Akses Offline (Refresh Token)',
    description:
      'Aplikasi dapat memperbarui sesinya tanpa meminta login ulang, termasuk saat kamu offline.',
    level: 'sensitive',
  },
}

/**
 * Resolve a scope string to a human-readable descriptor.
 *
 * Unknown scopes return a descriptor with `level: 'unknown'` so the UI can
 * flag them. Callers should treat these visibly different (warning color).
 */
export function resolveScopeLabel(scope: string): ScopeDescriptor {
  const trimmed = scope.trim()
  const known = REGISTRY[trimmed]
  if (known) {
    return { name: trimmed, ...known }
  }
  return {
    name: trimmed,
    label: trimmed || 'Scope tidak dikenal',
    description: 'Scope ini belum dikenali oleh portal SSO. Periksa ulang permintaan aplikasi sebelum menyetujui.',
    level: 'unknown',
  }
}

/**
 * Resolve a space-separated scope string to descriptor array.
 * Preserves order, de-duplicates, ignores empty tokens.
 */
export function resolveScopeList(scopeString: string | readonly string[]): readonly ScopeDescriptor[] {
  const tokens = Array.isArray(scopeString)
    ? scopeString
    : String(scopeString).split(/\s+/u)

  const seen = new Set<string>()
  const out: ScopeDescriptor[] = []
  for (const raw of tokens) {
    const name = raw.trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    out.push(resolveScopeLabel(name))
  }
  return out
}

/**
 * Returns true if any scope in the list is unknown — useful for
 * displaying a top-level warning on the consent page.
 */
export function hasUnknownScopes(scopes: readonly ScopeDescriptor[]): boolean {
  return scopes.some((s) => s.level === 'unknown')
}
