// app/components/profile/__tests__/ProfileSecurityCard.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileSecurityCard from '@/components/profile/ProfileSecurityCard.vue'
import type { AdminPrincipal } from '@/types/auth.types'

const LABELS = {
  title: 'Security',
  mfa: 'MFA',
  mfaVerified: 'Verified',
  mfaEnforced: 'Enforced, not verified',
  mfaOff: 'Not enforced',
  amr: 'Auth methods',
  acr: 'Auth context class',
  lastLogin: 'Last login',
  authTime: 'Auth time',
}

function principal(authOver = {}): AdminPrincipal {
  return {
    subject_id: 'sub-admin',
    email: 'admin@example.test',
    display_name: 'Admin',
    given_name: null,
    family_name: null,
    role: 'admin',
    last_login_at: '2026-06-28T09:00:00Z',
    auth_context: { auth_time: null, amr: ['pwd', 'mfa'], acr: null, mfa_enforced: true, mfa_verified: true, ...authOver },
    permissions: { view_admin_panel: true, manage_sessions: true, permissions: [], capabilities: {}, menus: [] },
  }
}

describe('ProfileSecurityCard', () => {
  it('renders the MFA posture badge (verified -> success) + auth methods', () => {
    const w = mount(ProfileSecurityCard, { props: { principal: principal(), labels: LABELS } })
    const mfa = w.find('[data-testid="profile-mfa-status"]')
    expect(mfa.attributes('data-tone')).toBe('success')
    expect(mfa.text()).toContain('Verified')
    expect(w.text()).toContain('pwd')
    expect(w.text()).toContain('mfa')
  })

  it('shows the enforced-not-verified posture as a warning', () => {
    const w = mount(ProfileSecurityCard, {
      props: { principal: principal({ mfa_enforced: true, mfa_verified: false }), labels: LABELS },
    })
    const mfa = w.find('[data-testid="profile-mfa-status"]')
    expect(mfa.attributes('data-tone')).toBe('warning')
    expect(mfa.text()).toContain('Enforced, not verified')
  })

  it('renders last login as a folio and em dash for null auth time', () => {
    const w = mount(ProfileSecurityCard, { props: { principal: principal(), labels: LABELS } })
    expect(w.text()).toContain('2026-06-28T09:00:00Z')
    expect(w.find('[data-testid="profile-auth-time"]').text()).toBe('—')
  })
})
