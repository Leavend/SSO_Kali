export function firstProfileNameWord(value?: string | null): string {
  return (value ?? '').trim().split(/\s+/u).filter(Boolean)[0] ?? ''
}

export function composeProfileDisplayName(
  givenName?: string | null,
  familyName?: string | null,
): string | null {
  const parts = [firstProfileNameWord(givenName), firstProfileNameWord(familyName)].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

export function resolveProfileDisplayName(input: {
  readonly displayName?: string | null
  readonly givenName?: string | null
  readonly familyName?: string | null
  readonly fallback: string
}): string {
  return (
    composeProfileDisplayName(input.givenName, input.familyName) ??
    input.displayName ??
    input.fallback
  )
}
