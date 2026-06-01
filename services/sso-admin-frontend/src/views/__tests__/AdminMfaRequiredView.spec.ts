import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminMfaRequiredView from '../AdminMfaRequiredView.vue'

describe('AdminMfaRequiredView', () => {
  it('explains MFA enrollment and links to portal enrollment without browser tokens', () => {
    const wrapper = mount(AdminMfaRequiredView, { props: { mode: 'enrollment' } })

    expect(wrapper.text()).toContain('Admin MFA required')
    expect(wrapper.text()).toContain('Enroll MFA')
    expect(
      wrapper.get('[data-testid="admin-mfa-ui-action ui-action--primary"]').attributes('href'),
    ).toBe('https://dev-sso.timeh.my.id/security/mfa')
    expect(wrapper.text()).not.toMatch(/accessToken|refreshToken|idToken|Bearer/i)
  })

  it('explains stale assurance and links to re-authentication', () => {
    const wrapper = mount(AdminMfaRequiredView, { props: { mode: 'step_up' } })

    expect(wrapper.text()).toContain('Re-verification required')
    expect(wrapper.text()).toContain('Verify again')
    expect(
      wrapper.get('[data-testid="admin-mfa-ui-action ui-action--primary"]').attributes('href'),
    ).toBe('https://dev-sso.timeh.my.id/?redirect=%2F__vue-preview%2F')
  })
})
