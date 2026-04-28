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
})
