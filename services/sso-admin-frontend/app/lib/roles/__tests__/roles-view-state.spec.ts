import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import { isRolesEmpty, resolveRoleStatusTone, resolveRolesViewState } from '../roles-view-state'
import type { AdminRole } from '@/types/users.types'

// Sample roles — read clearly as fixtures. A role DTO is public governance
// config: slug, name, description, counts, and the inline permission shape
// (slug/name/category, NO description) — never a token, secret, or raw PII.
const systemRole: AdminRole = {
  id: 1,
  slug: 'admin',
  name: 'Administrator',
  description: 'Built-in administrator role.',
  is_system: true,
  permissions: [
    { slug: 'admin.roles.read', name: 'Read roles', category: 'roles' },
    { slug: 'admin.roles.write', name: 'Write roles', category: 'roles' },
  ],
  user_count: 3,
  users_count: 3,
}

const customRole: AdminRole = {
  id: 2,
  slug: 'helpdesk',
  name: 'Helpdesk',
  description: null,
  is_system: false,
  permissions: [{ slug: 'admin.users.read', name: 'Read users', category: 'users' }],
  user_count: 12,
  users_count: 12,
}

describe('isRolesEmpty', () => {
  it('is true only for a zero-length list (no-data, distinct from forbidden)', () => {
    expect(isRolesEmpty([])).toBe(true)
    expect(isRolesEmpty([systemRole])).toBe(false)
  })
})

describe('resolveRolesViewState', () => {
  it('loading when roles are unfetched (null) and no error', () => {
    expect(resolveRolesViewState({ pending: true, error: null, roles: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveRolesViewState({
        pending: false,
        error: new ApiError(401, 'no session'),
        roles: null,
      }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveRolesViewState({ pending: false, error: new ApiError(403, 'forbidden'), roles: null }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveRolesViewState({ pending: false, error: new ApiError(500, 'boom'), roles: null }),
    ).toBe('error')
    expect(resolveRolesViewState({ pending: false, error: { statusCode: 502 }, roles: null })).toBe(
      'error',
    )
  })
  it('keeps null (unfetched) distinct from [] (empty)', () => {
    expect(resolveRolesViewState({ pending: false, error: null, roles: null })).toBe('loading')
    expect(resolveRolesViewState({ pending: false, error: null, roles: [] })).toBe('empty')
  })
  it('empty vs ready once a list is present (a stale-refresh error keeps the snapshot)', () => {
    expect(resolveRolesViewState({ pending: false, error: null, roles: [] })).toBe('empty')
    expect(resolveRolesViewState({ pending: false, error: null, roles: [customRole] })).toBe(
      'ready',
    )
    // a background-refresh error never blanks an existing snapshot
    expect(
      resolveRolesViewState({
        pending: false,
        error: new ApiError(500, 'boom'),
        roles: [customRole],
      }),
    ).toBe('ready')
    // an empty list with a background error stays "empty", never error
    expect(
      resolveRolesViewState({ pending: false, error: new ApiError(500, 'boom'), roles: [] }),
    ).toBe('empty')
  })
})

describe('resolveRoleStatusTone', () => {
  it('maps system roles to info and custom roles to neutral (never colour-alone elsewhere)', () => {
    expect(resolveRoleStatusTone(true)).toBe('info')
    expect(resolveRoleStatusTone(false)).toBe('neutral')
  })
})

describe('masked-DTO invariant (boundary)', () => {
  it('role DTOs carry no token/secret field name and no raw 16/18/10-digit PII run', () => {
    const blob = JSON.stringify([systemRole, customRole])
    expect(blob).not.toMatch(/access_?token|refresh_?token|id_?token|secret/iu)
    expect(blob).not.toMatch(/\b\d{16}\b/u) // raw NIK
    expect(blob).not.toMatch(/\b\d{18}\b/u) // raw NIP
    expect(blob).not.toMatch(/\b\d{10}\b/u) // raw NISN
  })
})
