import type { AdminRole } from '@/types/users.types'

// Pure model for the role × permission matrix. No Vue, no network: it turns the
// hydrated role DTOs into an editable grant map, toggles produce a NEW map
// (never mutate the seeded server snapshot), and the diff yields both the full
// sorted `permission_slugs` PUT-replace body and the added/removed impact behind
// the "N users affected" sync confirmation. The sync endpoint REPLACES the set,
// so `permission_slugs` is the complete pending set, not a patch.

export type RoleGrantMap = ReadonlyMap<string, ReadonlySet<string>>

// Seed from the role DTOs. A role with no permissions becomes an EMPTY set
// (present, size 0) so the matrix column renders all-denied rather than absent.
export function buildRoleGrantMap(roles: readonly AdminRole[]): RoleGrantMap {
  return new Map(roles.map((role) => [role.slug, new Set(role.permissions.map((p) => p.slug))]))
}

export function isGranted(grants: RoleGrantMap, roleSlug: string, permissionSlug: string): boolean {
  return grants.get(roleSlug)?.has(permissionSlug) ?? false
}

// Pure toggle: copies the map and only the affected role's set, leaving every
// other column's set reference intact. The returned map is always a new object.
export function togglePendingGrant(
  grants: RoleGrantMap,
  roleSlug: string,
  permissionSlug: string,
  granted: boolean,
): RoleGrantMap {
  const next = new Map(grants)
  const current = new Set(grants.get(roleSlug) ?? [])
  if (granted) current.add(permissionSlug)
  else current.delete(permissionSlug)
  next.set(roleSlug, current)
  return next
}

export type RoleGrantDiff = {
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly changed: boolean
  readonly permission_slugs: readonly string[]
}

export type RolePermissionImpact = {
  readonly affectedUsers: number
  readonly addedCount: number
  readonly removedCount: number
}

// Pure summary for the sync-confirm dialog: how many users are affected and how
// many permissions are being added / removed for a given role × diff pair.
export function describePermissionImpact(role: AdminRole, diff: RoleGrantDiff): RolePermissionImpact {
  return {
    affectedUsers: role.user_count,
    addedCount: diff.added.length,
    removedCount: diff.removed.length,
  }
}

// Diff one role's original vs pending set. `permission_slugs` is the full sorted
// pending set (the PUT-replace body — an empty array is a valid "clear all").
export function diffRoleGrants(
  original: ReadonlySet<string>,
  pending: ReadonlySet<string>,
): RoleGrantDiff {
  const added = [...pending].filter((slug) => !original.has(slug)).sort()
  const removed = [...original].filter((slug) => !pending.has(slug)).sort()
  return {
    added,
    removed,
    changed: added.length > 0 || removed.length > 0,
    permission_slugs: [...pending].sort(),
  }
}
