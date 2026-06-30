// app/components/profile/__tests__/ProfileIdentityCard.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileIdentityCard from '@/components/profile/ProfileIdentityCard.vue'
import type { AdminPrincipal } from '@/types/auth.types'

const LABELS = {
  title: 'Identity',
  email: 'Email',
  subjectId: 'Admin code',
  givenName: 'First name',
  familyName: 'Last name',
  role: 'Role',
}

function principal(over: Partial<AdminPrincipal> = {}): AdminPrincipal {
  return {
    subject_id: 'sub-admin-7',
    email: 'admin@example.test',
    display_name: 'Admin Sentinel',
    given_name: 'Admin',
    family_name: null,
    role: 'admin',
    last_login_at: null,
    auth_context: { auth_time: null, amr: ['pwd'], acr: null, mfa_enforced: true, mfa_verified: true },
    permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
    ...over,
  }
}

describe('ProfileIdentityCard', () => {
  it('renders the display name, email (allowed field), subject id, and role badge', () => {
    const w = mount(ProfileIdentityCard, { props: { principal: principal(), labels: LABELS } })
    expect(w.text()).toContain('Admin Sentinel')
    expect(w.text()).toContain('admin@example.test')
    expect(w.text()).toContain('sub-admin-7')
    const role = w.find('[data-testid="profile-role"]')
    expect(role.text()).toContain('admin')
    expect(role.attributes('data-tone')).toBe('neutral')
  })

  it('renders an em dash for a null name field', () => {
    const w = mount(ProfileIdentityCard, { props: { principal: principal({ family_name: null }), labels: LABELS } })
    expect(w.find('[data-testid="profile-family-name"]').text()).toBe('—')
  })
})
