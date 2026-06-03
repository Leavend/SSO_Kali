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
    const href = wrapper
      .get('[data-testid="admin-mfa-ui-action ui-action--primary"]')
      .attributes('href')
    const url = new URL(String(href))

    expect(wrapper.text()).toContain('Re-authentication required')
    expect(wrapper.text()).toContain('Re-authenticate')
    expect(url.pathname).toBe('/auth/login')
    expect(url.searchParams.get('prompt')).toBe('login')
    expect(url.searchParams.get('max_age')).toBe('0')
    expect(url.searchParams.get('return_to')).toBe('/__vue-preview/')
  })
})
