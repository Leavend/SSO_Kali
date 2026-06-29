import type { ExternalIdentityProvider } from '@/types/external-idps.types'

export function filterProviders(
  providers: readonly ExternalIdentityProvider[],
  query: string,
): readonly ExternalIdentityProvider[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return providers
  return providers.filter((provider) =>
    [provider.display_name, provider.provider_key, provider.issuer].some(
      (field) => field != null && field.toLowerCase().includes(needle),
    ),
  )
}

// Parse the mapping-preview "sample claims" textarea into a JSON object. Never throws.
export type ParsedClaims =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: 'syntax' | 'not_object' }

export function parseClaimsJson(text: string): ParsedClaims {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'syntax' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'not_object' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}
