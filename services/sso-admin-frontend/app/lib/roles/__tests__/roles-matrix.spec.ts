import { describe, expect, it } from 'vitest'
import {
  buildRoleGrantMap,
  describePermissionImpact,
  diffRoleGrants,
  isGranted,
  reseedPendingGrants,
  togglePendingGrant,
  type RoleGrantMap,
} from '../roles-matrix'
import type { AdminRole } from '@/types/users.types'

const base: AdminRole = {
  id: 1,
  slug: 'administrator',
  name: 'Administrator',
  description: null,
  is_system: true,
  permissions: [],
  user_count: 0,
  users_count: 0,
}

function makeRole(overrides: Partial<AdminRole>): AdminRole {
  return { ...base, ...overrides }
}

const perm = (slug: string, category: string | null = 'roles') => ({
  slug,
  name: slug.replace(/[._]/g, ' '),
  category,
})

const roles: readonly AdminRole[] = [
  makeRole({
    slug: 'administrator',
    name: 'Administrator',
    is_system: true,
    permissions: [perm('admin.roles.read'), perm('admin.roles.write')],
  }),
  makeRole({
    slug: 'auditor',
    name: 'Read-only Auditor',
    is_system: false,
    permissions: [perm('admin.roles.read')],
  }),
]

describe('buildRoleGrantMap', () => {
  it('builds a roleSlug -> Set<permissionSlug> map from the role DTOs', () => {
    const grants = buildRoleGrantMap(roles)
    expect([...(grants.get('administrator') ?? [])].sort()).toEqual([
      'admin.roles.read',
      'admin.roles.write',
    ])
    expect([...(grants.get('auditor') ?? [])]).toEqual(['admin.roles.read'])
  })

  it('represents a role with no permissions as an empty set, not absent', () => {
    const grants = buildRoleGrantMap([makeRole({ slug: 'empty-role', permissions: [] })])
    expect(grants.get('empty-role')?.size).toBe(0)
  })
})

describe('isGranted', () => {
  const grants: RoleGrantMap = buildRoleGrantMap(roles)

  it('reports true only for a permission held by the role', () => {
    expect(isGranted(grants, 'administrator', 'admin.roles.write')).toBe(true)
    expect(isGranted(grants, 'auditor', 'admin.roles.write')).toBe(false)
  })

  it('reports false for an unknown role slug', () => {
    expect(isGranted(grants, 'ghost', 'admin.roles.read')).toBe(false)
  })
})

describe('togglePendingGrant', () => {
  it('returns a NEW map and never mutates the input (granting a permission)', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'auditor', 'admin.roles.write', true)
    expect(next).not.toBe(original)
    expect(isGranted(next, 'auditor', 'admin.roles.write')).toBe(true)
    // the original seeded map is untouched
    expect(isGranted(original, 'auditor', 'admin.roles.write')).toBe(false)
  })

  it('removes a permission when granted is false without touching other roles', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'administrator', 'admin.roles.write', false)
    expect(isGranted(next, 'administrator', 'admin.roles.write')).toBe(false)
    expect(isGranted(next, 'administrator', 'admin.roles.read')).toBe(true)
    // unrelated role column is preserved
    expect(isGranted(next, 'auditor', 'admin.roles.read')).toBe(true)
    // the original administrator set is unchanged
    expect(isGranted(original, 'administrator', 'admin.roles.write')).toBe(true)
  })

  it('is idempotent: granting an already-granted permission yields the same membership', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'auditor', 'admin.roles.read', true)
    expect([...(next.get('auditor') ?? [])]).toEqual(['admin.roles.read'])
  })

  it('grants onto a role that was not seeded in the map', () => {
    const original = buildRoleGrantMap(roles)
    const next = togglePendingGrant(original, 'new-role', 'admin.roles.read', true)
    expect(isGranted(next, 'new-role', 'admin.roles.read')).toBe(true)
  })
})

describe('diffRoleGrants', () => {
  it('reports added/removed sorted and the full sorted permission_slugs PUT body', () => {
    const original = new Set(['admin.roles.read', 'admin.roles.write'])
    const pending = new Set(['admin.users.read', 'admin.roles.read'])
    const diff = diffRoleGrants(original, pending)
    expect(diff.added).toEqual(['admin.users.read'])
    expect(diff.removed).toEqual(['admin.roles.write'])
    expect(diff.changed).toBe(true)
    expect(diff.permission_slugs).toEqual(['admin.roles.read', 'admin.users.read'])
  })

  it('reports changed=false with empty added/removed for identical sets', () => {
    const original = new Set(['admin.roles.read'])
    const pending = new Set(['admin.roles.read'])
    const diff = diffRoleGrants(original, pending)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toBe(false)
    expect(diff.permission_slugs).toEqual(['admin.roles.read'])
  })

  it('treats clearing all permissions as a valid empty PUT body', () => {
    const original = new Set(['admin.roles.read', 'admin.roles.write'])
    const pending = new Set<string>()
    const diff = diffRoleGrants(original, pending)
    expect(diff.removed).toEqual(['admin.roles.read', 'admin.roles.write'])
    expect(diff.added).toEqual([])
    expect(diff.changed).toBe(true)
    expect(diff.permission_slugs).toEqual([])
  })
})

describe('describePermissionImpact', () => {
  it('returns affectedUsers from role.user_count, addedCount and removedCount from diff lengths', () => {
    const role = makeRole({ slug: 'editor', user_count: 42, users_count: 42 })
    const diff = diffRoleGrants(
      new Set(['admin.roles.read', 'admin.roles.write']),
      new Set(['admin.roles.read', 'admin.users.read', 'admin.users.write']),
    )
    const impact = describePermissionImpact(role, diff)
    expect(impact).toStrictEqual({ affectedUsers: 42, addedCount: 2, removedCount: 1 })
  })

  it('returns zeros for a role with no users and an unchanged diff', () => {
    const role = makeRole({ slug: 'ghost', user_count: 0, users_count: 0 })
    const diff = diffRoleGrants(new Set(['admin.roles.read']), new Set(['admin.roles.read']))
    const impact = describePermissionImpact(role, diff)
    expect(impact).toStrictEqual({ affectedUsers: 0, addedCount: 0, removedCount: 0 })
  })
})

describe('reseedPendingGrants', () => {
  const grantMap = (entries: Record<string, readonly string[]>): RoleGrantMap =>
    new Map(Object.entries(entries).map(([slug, perms]) => [slug, new Set(perms)]))

  it('preserves an unsaved (dirty) column when another column is saved + refreshed', () => {
    // Operator edited BOTH editor and auditor, then saved editor → the list refresh
    // brings editor's new server set while auditor's column is untouched server-side.
    const previous = grantMap({ editor: ['a'], auditor: ['a'] })
    const next = grantMap({ editor: ['a', 'b'], auditor: ['a'] }) // editor saved server-side
    const pending = grantMap({ editor: ['a', 'b'], auditor: ['a', 'c'] }) // auditor still dirty
    const merged = reseedPendingGrants(next, previous, pending)
    // auditor's unsaved 'c' survives the refresh ...
    expect([...(merged.get('auditor') ?? [])].sort()).toEqual(['a', 'c'])
    // ... and the saved editor column now matches the server set (clean).
    expect([...(merged.get('editor') ?? [])].sort()).toEqual(['a', 'b'])
  })

  it('adopts the new server set for a clean column (genuine server-side change flows in)', () => {
    const previous = grantMap({ editor: ['a'] })
    const next = grantMap({ editor: ['a', 'b'] }) // changed server-side
    const pending = grantMap({ editor: ['a'] }) // operator made no edit (clean)
    const merged = reseedPendingGrants(next, previous, pending)
    expect([...(merged.get('editor') ?? [])].sort()).toEqual(['a', 'b'])
  })

  it('includes a newly-added server role and never mutates its inputs', () => {
    const previous = grantMap({ editor: ['a'] })
    const next = grantMap({ editor: ['a'], newcomer: ['x'] })
    const pending = grantMap({ editor: ['a'] })
    const merged = reseedPendingGrants(next, previous, pending)
    expect([...(merged.get('newcomer') ?? [])]).toEqual(['x'])
    expect(merged).not.toBe(next)
    expect([...(pending.get('editor') ?? [])]).toEqual(['a']) // inputs untouched
  })
})
