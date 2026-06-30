import { describe, expect, it } from 'vitest'
import { resolveProfileViewState, resolveMfaTone } from '@/lib/profile/profile-view-state'
import type { AdminAuthContext, AdminPrincipal } from '@/types/auth.types'

const AUTH: AdminAuthContext = {
  auth_time: null,
  amr: ['pwd'],
  acr: null,
  mfa_enforced: true,
  mfa_verified: true,
}

const PRINCIPAL: AdminPrincipal = {
  subject_id: 'sub-admin',
  email: 'admin@example.test',
  display_name: 'Admin',
  given_name: null,
  family_name: null,
  role: 'admin',
  last_login_at: null,
  auth_context: AUTH,
  permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
}

describe('resolveProfileViewState', () => {
  it('is loading without a principal, ready with one', () => {
    expect(resolveProfileViewState({ principal: null })).toBe('loading')
    expect(resolveProfileViewState({ principal: PRINCIPAL })).toBe('ready')
  })
})

describe('resolveMfaTone', () => {
  it('verified -> success', () => {
    expect(resolveMfaTone({ ...AUTH, mfa_enforced: true, mfa_verified: true })).toBe('success')
  })
  it('enforced but not verified -> warning', () => {
    expect(resolveMfaTone({ ...AUTH, mfa_enforced: true, mfa_verified: false })).toBe('warning')
  })
  it('not enforced -> neutral', () => {
    expect(resolveMfaTone({ ...AUTH, mfa_enforced: false, mfa_verified: false })).toBe('neutral')
  })
})
