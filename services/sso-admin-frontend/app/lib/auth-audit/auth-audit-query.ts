import type { AuthAuditFilters } from '@/types/auth-audit.types'

export const DEFAULT_AUTH_AUDIT_LIMIT = 50

/**
 * Builds the list URL with a `?`-query of every set, non-blank filter. Blank
 * strings / null / undefined are skipped so an empty filter input never narrows
 * the query. Pure — no side effects, returns a new string.
 */
export function buildAuthAuditQuery(path: string, filters: AuthAuditFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
