import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/api-client'
import {
  isUsersListEmpty,
  resolveUserDetailViewState,
  resolveUserStatusTone,
  resolveUsersViewState,
} from '../users-view-state'
import type { AdminUserDetail, AdminUserListItem } from '@/types/users.types'

// Sample row — reads clearly as a fixture. PII fields hold the BACKEND-MASKED
// form only (GovernmentIdentifier masking), never the raw 16/18/10-digit value.
const sample: AdminUserListItem = {
  id: 1,
  subject_id: 'sub-sample-0001',
  email: 'operator.sample@example.test',
  given_name: 'Operator',
  family_name: 'Sample',
  display_name: 'Operator Sample',
  role: 'admin',
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
  email_verified_at: '2026-06-01T00:00:00Z',
  last_login_at: '2026-06-27T09:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  nik: '32••••••••••1234',
  nip: '1980••••••••••0012',
  nisn: '00••••5678',
  birth_date: '1990-••-••',
  mfa_enrolled: true,
  mfa_methods: ['totp'],
  mfa_mandatory: false,
  roles: [{ slug: 'admin', name: 'Administrator', is_system: true }],
  login_context: {
    ip_address: '203.0.113.10',
    mfa_required: true,
    last_seen_at: '2026-06-27T09:00:00Z',
  },
}

const detail: AdminUserDetail = (() => {
  const { login_context: _drop, ...rest } = sample
  return rest
})()

describe('isUsersListEmpty', () => {
  it('is true only for a zero-length list (no-data, distinct from forbidden)', () => {
    expect(isUsersListEmpty([])).toBe(true)
    expect(isUsersListEmpty([sample])).toBe(false)
  })
})

describe('resolveUsersViewState', () => {
  it('loading when no list and no error', () => {
    expect(resolveUsersViewState({ pending: true, error: null, list: null })).toBe('loading')
  })
  it('maps a first-load 401 to unauthenticated', () => {
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(401, 'no session'), list: null }),
    ).toBe('unauthenticated')
  })
  it('maps a first-load 403 to forbidden (distinct from empty)', () => {
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(403, 'forbidden'), list: null }),
    ).toBe('forbidden')
  })
  it('maps other first-load errors to error (incl. H3-shaped statusCode)', () => {
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(500, 'boom'), list: null }),
    ).toBe('error')
    expect(resolveUsersViewState({ pending: false, error: { statusCode: 502 }, list: null })).toBe(
      'error',
    )
  })
  it('empty vs ready once a list is present (a stale-refresh error keeps the snapshot)', () => {
    expect(resolveUsersViewState({ pending: false, error: null, list: [] })).toBe('empty')
    expect(resolveUsersViewState({ pending: false, error: null, list: [sample] })).toBe('ready')
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(500, 'boom'), list: [sample] }),
    ).toBe('ready')
    // an empty list with a background error is still "empty", never blanked to error
    expect(
      resolveUsersViewState({ pending: false, error: new ApiError(500, 'boom'), list: [] }),
    ).toBe('empty')
  })
})

describe('resolveUserDetailViewState', () => {
  it('loading when no user and no error', () => {
    expect(resolveUserDetailViewState({ pending: true, error: null, user: null })).toBe('loading')
  })
  it('maps a first-load 404 to not_found (distinct from error)', () => {
    expect(
      resolveUserDetailViewState({
        pending: false,
        error: new ApiError(404, 'missing'),
        user: null,
      }),
    ).toBe('not_found')
    expect(
      resolveUserDetailViewState({ pending: false, error: { statusCode: 404 }, user: null }),
    ).toBe('not_found')
  })
  it('maps 401/403/other first-load errors', () => {
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(401, 'x'), user: null }),
    ).toBe('unauthenticated')
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(403, 'x'), user: null }),
    ).toBe('forbidden')
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(500, 'x'), user: null }),
    ).toBe('error')
  })
  it('ready once the user is present, even on a background-refresh error', () => {
    expect(resolveUserDetailViewState({ pending: false, error: null, user: detail })).toBe('ready')
    expect(
      resolveUserDetailViewState({ pending: false, error: new ApiError(500, 'x'), user: detail }),
    ).toBe('ready')
  })
})

describe('resolveUserStatusTone', () => {
  it('maps account statuses to Swiss tones (red reserved for locked)', () => {
    expect(resolveUserStatusTone('active')).toBe('success')
    expect(resolveUserStatusTone('locked')).toBe('danger')
    expect(resolveUserStatusTone('disabled')).toBe('neutral')
    expect(resolveUserStatusTone('deactivated')).toBe('neutral')
    expect(resolveUserStatusTone(null)).toBe('neutral')
    expect(resolveUserStatusTone(undefined)).toBe('neutral')
    expect(resolveUserStatusTone('something-unknown')).toBe('neutral')
  })
})

describe('masked-PII invariant (DTO boundary)', () => {
  it('the sample DTO carries masked identifiers only — no raw 16/18/10-digit run', () => {
    const blob = JSON.stringify(sample)
    expect(blob).not.toMatch(/\b\d{16}\b/u) // raw NIK
    expect(blob).not.toMatch(/\b\d{18}\b/u) // raw NIP
    expect(blob).not.toMatch(/\b\d{10}\b/u) // raw NISN
  })
})
