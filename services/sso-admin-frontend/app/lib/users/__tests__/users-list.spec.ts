import { describe, expect, it } from 'vitest'
import { USERS_PAGE_SIZE, filterUsers, pageCount, paginateUsers } from '../users-list'
import type { AdminUserListItem } from '@/types/users.types'

// A single fully-typed sample row; overrides keep each case readable. PII fields
// are the BACKEND-MASKED form (only the trailing 4 digits survive) — fixtures
// must never carry a raw 16/18/10-digit identifier, matching the live contract.
const base: AdminUserListItem = {
  id: 1,
  subject_id: 'usr_budi',
  email: 'budi.santoso@example.test',
  given_name: 'Budi',
  family_name: 'Santoso',
  display_name: 'Budi Santoso',
  role: 'user',
  status: 'active',
  effective_status: 'active',
  disabled_at: null,
  disabled_reason: null,
  locked_at: null,
  locked_until: null,
  locked_reason: null,
  locked_by_subject_id: null,
  lock_count: 0,
  local_account_enabled: true,
  profile_synced_at: null,
  email_verified_at: null,
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  nik: '••••••••••••3456',
  nip: null,
  nisn: null,
  birth_date: null,
  mfa_enrolled: false,
  mfa_methods: [],
  mfa_mandatory: false,
  roles: [],
  login_context: null,
}

function makeUser(overrides: Partial<AdminUserListItem>): AdminUserListItem {
  return { ...base, ...overrides }
}

const sample: readonly AdminUserListItem[] = [
  makeUser({
    subject_id: 'usr_budi',
    display_name: 'Budi Santoso',
    email: 'budi@example.test',
    effective_status: 'active',
  }),
  makeUser({
    subject_id: 'usr_citra',
    display_name: 'Citra Lestari',
    email: 'citra@example.test',
    effective_status: 'locked',
  }),
  makeUser({
    subject_id: 'usr_dewi',
    display_name: null,
    email: 'dewi.k@example.test',
    effective_status: 'disabled',
  }),
  makeUser({
    subject_id: 'usr_eko',
    display_name: 'Eko Prasetyo',
    email: 'eko@example.test',
    effective_status: 'deactivated',
  }),
]

describe('filterUsers', () => {
  it('returns the full list when query is empty and status is "all"', () => {
    expect(filterUsers(sample, { query: '', status: 'all' })).toHaveLength(4)
    // whitespace-only query is treated as empty
    expect(filterUsers(sample, { query: '   ', status: 'all' })).toHaveLength(4)
  })

  it('matches the query case-insensitively across display_name, email and subject_id', () => {
    expect(filterUsers(sample, { query: 'citra', status: 'all' }).map((u) => u.subject_id)).toEqual(
      ['usr_citra'],
    )
    expect(
      filterUsers(sample, { query: 'EKO@EXAMPLE', status: 'all' }).map((u) => u.subject_id),
    ).toEqual(['usr_eko'])
    expect(
      filterUsers(sample, { query: 'usr_dewi', status: 'all' }).map((u) => u.subject_id),
    ).toEqual(['usr_dewi'])
  })

  it('does not crash on a null display_name and still matches by email', () => {
    expect(
      filterUsers(sample, { query: 'dewi.k', status: 'all' }).map((u) => u.subject_id),
    ).toEqual(['usr_dewi'])
  })

  it('filters by effective_status, not the raw status field', () => {
    expect(filterUsers(sample, { query: '', status: 'locked' }).map((u) => u.subject_id)).toEqual([
      'usr_citra',
    ])
    expect(
      filterUsers(sample, { query: '', status: 'deactivated' }).map((u) => u.subject_id),
    ).toEqual(['usr_eko'])
  })

  it('combines query and status (AND)', () => {
    expect(filterUsers(sample, { query: 'citra', status: 'active' })).toHaveLength(0)
    expect(filterUsers(sample, { query: 'citra', status: 'locked' })).toHaveLength(1)
  })
})

describe('paginateUsers', () => {
  const many: readonly AdminUserListItem[] = Array.from({ length: 30 }, (_, i) =>
    makeUser({ subject_id: `usr_${i}`, email: `u${i}@example.test`, display_name: `User ${i}` }),
  )

  it('returns the first page-size slice for page 1 and the remainder for page 2', () => {
    expect(paginateUsers(many, 1)).toHaveLength(USERS_PAGE_SIZE)
    expect(paginateUsers(many, 2)).toHaveLength(30 - USERS_PAGE_SIZE)
    expect(paginateUsers(many, 1)[0]?.subject_id).toBe('usr_0')
    expect(paginateUsers(many, 2)[0]?.subject_id).toBe(`usr_${USERS_PAGE_SIZE}`)
  })

  it('honours an explicit page size and clamps page < 1 to the first page', () => {
    expect(paginateUsers(many, 1, 10)).toHaveLength(10)
    expect(paginateUsers(many, 0, 10)[0]?.subject_id).toBe('usr_0')
  })

  it('returns an empty slice for a page beyond the data', () => {
    expect(paginateUsers(many, 99)).toEqual([])
  })
})

describe('pageCount', () => {
  it('ceils total/size and is never below 1', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(25)).toBe(1)
    expect(pageCount(26)).toBe(2)
    expect(pageCount(50)).toBe(2)
    expect(pageCount(51)).toBe(3)
    expect(pageCount(10, 10)).toBe(1)
    expect(pageCount(11, 10)).toBe(2)
  })
})
