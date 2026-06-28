import { describe, expect, it } from 'vitest'
import {
  buildRoleGrantMap,
  diffRoleGrants,
  isGranted,
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
