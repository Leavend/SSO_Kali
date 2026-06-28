import { describe, expect, it } from 'vitest'
import { ROLES_PAGE_SIZE, filterRoles, paginateRoles, rolesPageCount } from '../roles-list'
import type { AdminRole } from '@/types/users.types'

// One fully-typed sample role; overrides keep each case readable. Role slugs +
// names are public access-control config (no token/secret/PII), matching the
// masked DTO the backend returns from GET /admin/api/roles.
const base: AdminRole = {
  id: 1,
  slug: 'administrator',
  name: 'Administrator',
  description: 'Full administrative access',
  is_system: true,
  permissions: [],
  user_count: 0,
  users_count: 0,
}

function makeRole(overrides: Partial<AdminRole>): AdminRole {
  return { ...base, ...overrides }
}

const sample: readonly AdminRole[] = [
  makeRole({ slug: 'administrator', name: 'Administrator', is_system: true }),
  makeRole({ slug: 'auditor', name: 'Read-only Auditor', is_system: false }),
  makeRole({ slug: 'help-desk', name: 'Help Desk', is_system: false }),
  makeRole({ slug: 'security-officer', name: 'Security Officer', is_system: false }),
]

describe('filterRoles', () => {
  it('returns the full list when the query is empty or whitespace-only', () => {
    expect(filterRoles(sample, '')).toHaveLength(4)
    expect(filterRoles(sample, '   ')).toHaveLength(4)
  })

  it('matches the query case-insensitively across name and slug', () => {
    expect(filterRoles(sample, 'auditor').map((r) => r.slug)).toEqual(['auditor'])
    expect(filterRoles(sample, 'HELP DESK').map((r) => r.slug)).toEqual(['help-desk'])
    expect(filterRoles(sample, 'security-officer').map((r) => r.slug)).toEqual(['security-officer'])
  })

  it('matches on slug even when the name does not contain the query', () => {
    expect(filterRoles(sample, 'administrator').map((r) => r.slug)).toEqual(['administrator'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterRoles(sample, 'nonexistent')).toEqual([])
  })
})

describe('paginateRoles', () => {
  const many: readonly AdminRole[] = Array.from({ length: 30 }, (_, i) =>
    makeRole({ slug: `role-${i}`, name: `Role ${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateRoles(many, 1, ROLES_PAGE_SIZE)).toHaveLength(ROLES_PAGE_SIZE)
    expect(paginateRoles(many, 2, ROLES_PAGE_SIZE)).toHaveLength(30 - ROLES_PAGE_SIZE)
    expect(paginateRoles(many, 1, ROLES_PAGE_SIZE)[0]?.slug).toBe('role-0')
    expect(paginateRoles(many, 2, ROLES_PAGE_SIZE)[0]?.slug).toBe(`role-${ROLES_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateRoles(many, 1, 10)).toHaveLength(10)
    expect(paginateRoles(many, 0, 10)[0]?.slug).toBe('role-0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateRoles(many, 99, ROLES_PAGE_SIZE)).toEqual([])
  })
})

describe('rolesPageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(rolesPageCount(0, ROLES_PAGE_SIZE)).toBe(1)
    expect(rolesPageCount(25, ROLES_PAGE_SIZE)).toBe(1)
    expect(rolesPageCount(26, ROLES_PAGE_SIZE)).toBe(2)
    expect(rolesPageCount(50, ROLES_PAGE_SIZE)).toBe(2)
    expect(rolesPageCount(51, ROLES_PAGE_SIZE)).toBe(3)
    expect(rolesPageCount(10, 10)).toBe(1)
    expect(rolesPageCount(11, 10)).toBe(2)
  })

  it('pins the default page size to 25 (parity with the Users table)', () => {
    expect(ROLES_PAGE_SIZE).toBe(25)
  })
})
