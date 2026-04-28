import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClientIntegrationProcedure from '../web/components/ClientIntegrationProcedure.vue'

describe('ClientIntegrationProcedure', () => {
  it('shows RFC 7642 client onboarding tracks for live and development apps', () => {
    const wrapper = mount(ClientIntegrationProcedure)

    expect(wrapper.text()).toContain('RFC 7642 onboarding')
    expect(wrapper.text()).toContain('Integrasi aplikasi yang sudah berjalan')
    expect(wrapper.text()).toContain('Integrasi aplikasi yang sedang dibangun')
    expect(wrapper.text()).toContain('SCIM')
    expect(wrapper.text()).toContain('Zero-downtime canary')
    expect(wrapper.text()).toContain('Rollback client toggle')
  })

  it('renders an interactive stitching contract for admins', () => {
    const wrapper = mount(ClientIntegrationProcedure)

    expect(wrapper.text()).toContain('Client stitching wizard')
    expect(wrapper.text()).toContain('Jahit aplikasi ke SSO broker')
    expect(wrapper.text()).toContain('Public + PKCE')
    expect(wrapper.text()).toContain('Env handoff')
    expect(wrapper.text()).toContain('Validasi via broker')
    expect(wrapper.text()).toContain('Registry patch')
    expect(wrapper.text()).toContain('Provisioning readiness')
    expect(wrapper.text()).toContain('Back-channel logout smoke test passed')
    expect(wrapper.text()).toContain('Dynamic registrations')
    expect(wrapper.text()).toContain('Stage registration')
    expect(wrapper.text()).toContain('SSO_CLIENT_ID=customer-portal')
    expect(wrapper.text()).toContain('SSO_REDIRECT_URI=https://customer-dev.timeh.my.id/auth/callback')
  })
})
