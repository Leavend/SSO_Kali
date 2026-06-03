import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ForbiddenView from '../ForbiddenView.vue'

vi.mock('@/config/adminEnvironment', () => ({
  getAdminEnvironment: () => ({
    adminBaseUrl: 'https://admin-sso.example.test',
    publicBasePath: '/',
    ssoBaseUrl: 'https://sso.example.test',
    zitadelIssuerUrl: 'https://id.example.test',
  }),
}))

describe('ForbiddenView', () => {
  it('offers a retry login action that clears the stale admin BFF session', () => {
    const wrapper = mount(ForbiddenView)
    const links = wrapper.findAll('a')

    expect(links[0]?.text()).toBe('Try Login Again')
    expect(links[0]?.attributes('href')).toBe('http://localhost:3000/auth/logout')
    expect(links[1]?.text()).toBe('Back to SSO Portal')
    expect(links[1]?.attributes('href')).toBe('https://sso.example.test/home')
  })
})
