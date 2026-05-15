/**
 * Scope registry for consent UI (FR-004 / UC-13).
 *
 * Mirrors the backend scope catalog (`App\Support\Oidc\OidcScope::catalog()`).
 * Both sides MUST stay in lock-step; consent endpoint enriches each scope
 * with backend-authored description text, while the frontend owns the
 * localized label and risk level used by the consent UI.
 *
 * Design rules:
 *   - Known scopes get a localized Indonesian label and a risk level.
 *   - Unknown scopes fall back to a generic safe label that does NOT
 *     echo the raw scope string as the headline (anti-phishing) — the
 *     raw name is still shown beneath the label as a code reference so
 *     the user can verify it.
 *   - Backend-supplied descriptions override the frontend default when
 *     a consent transaction is loaded; this keeps copy authoritative
 *     and consistent across portals.
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
  roles: {
    label: 'Peran (Roles)',
    description: 'Akses ke daftar peran RBAC yang ditugaskan ke akun kamu.',
    level: 'sensitive',
  },
  permissions: {
    label: 'Izin (Permissions)',
    description: 'Akses ke daftar izin terperinci yang diberikan ke akun kamu.',
    level: 'sensitive',
  },
}

const UNKNOWN_LABEL = 'Akses tambahan (belum terverifikasi)'
const UNKNOWN_DESCRIPTION =
  'Scope ini belum terdaftar pada portal SSO. Verifikasi kebutuhannya bersama administrator sebelum kamu menyetujui.'

/**
 * Resolve a scope string to a human-readable descriptor.
 *
 * Unknown scopes return a safe generic label so an attacker cannot inject
 * misleading copy via the scope string itself. The raw scope name is kept
 * as `name` so the UI can still surface it as a code reference.
 */
export function resolveScopeLabel(scope: string): ScopeDescriptor {
  const trimmed = scope.trim()
  const known = REGISTRY[trimmed]
  if (known) return { name: trimmed, ...known }

  return {
    name: trimmed,
    label: UNKNOWN_LABEL,
    description: UNKNOWN_DESCRIPTION,
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
 * Merge backend-authored descriptions into the local scope descriptors,
 * preserving the localized label + level. Used by the consent UI so the
 * displayed copy stays in lock-step with the backend registry without
 * losing localization or risk indicators.
 */
export function mergeBackendScopes(
  requested: readonly string[],
  backend: ReadonlyMap<string, string>,
): readonly ScopeDescriptor[] {
  const seen = new Set<string>()
  const out: ScopeDescriptor[] = []
  for (const raw of requested) {
    const name = raw.trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)

    const base = resolveScopeLabel(name)
    const backendDescription = backend.get(name)
    if (backendDescription && backendDescription.trim() !== '') {
      out.push({ ...base, description: backendDescription })
      continue
    }
    out.push(base)
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
