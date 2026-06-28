import type { AdminRole } from '@/types/users.types'

// The backend `GET /admin/api/roles` returns a flat `{ roles }` with no query
// params, so search / pagination are derived client-side over the hydrated,
// already-masked list. 25 mirrors the Users table page size. Unlike Users there
// is no status facet — a role's only filter axis is its name/slug text.
export const ROLES_PAGE_SIZE = 25

// Case-insensitive substring match over the operator-meaningful fields: the
// human role name and the stable slug. Role slugs + names are public access
// config, not secrets, so both are searchable.
export function filterRoles(roles: readonly AdminRole[], query: string): readonly AdminRole[] {
  const q = query.trim().toLowerCase()
  if (q === '') return roles
  return roles.filter(
    (role) => role.name.toLowerCase().includes(q) || role.slug.toLowerCase().includes(q),
  )
}

// 1-based page; page < 1 is clamped to the first page so a stale page ref can
// never index before the start of the list.
export function paginateRoles(
  roles: readonly AdminRole[],
  page: number,
  size: number = ROLES_PAGE_SIZE,
): readonly AdminRole[] {
  const start = (Math.max(1, page) - 1) * size
  return roles.slice(start, start + size)
}

// Always at least one page so the folio renders "01 / 01" for an empty result.
export function rolesPageCount(total: number, size: number = ROLES_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}
