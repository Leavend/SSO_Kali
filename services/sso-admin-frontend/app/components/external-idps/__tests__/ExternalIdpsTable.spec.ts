import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExternalIdpsTable from '../ExternalIdpsTable.vue'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const providers: readonly ExternalIdentityProvider[] = [
  {
    provider_key: 'acme',
    display_name: 'Acme IdP',
    issuer: 'https://i',
    metadata_url: 'https://m',
    client_id: 'c',
    enabled: true,
    health_status: 'healthy',
  },
  {
    provider_key: 'globex',
    display_name: 'Globex SSO',
    issuer: 'https://i2',
    metadata_url: 'https://m2',
    client_id: 'c2',
    enabled: false,
    health_status: 'unhealthy',
  },
]

const props = {
  providers,
  caption: 'Providers',
  providerLabel: 'Provider',
  keyLabel: 'Key',
  statusLabel: 'Status',
  healthLabel: 'Health',
  enabledText: 'Enabled',
  disabledText: 'Disabled',
  healthLabels: { healthy: 'Healthy', unhealthy: 'Unhealthy', unknown: 'Unknown' },
}

describe('ExternalIdpsTable', () => {
  it('renders one selectable row per provider with status + health labels', () => {
    const wrapper = mount(ExternalIdpsTable, { props })
    expect(wrapper.find('[data-testid="external-idp-select-acme"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="external-idp-select-globex"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Enabled')
    expect(wrapper.text()).toContain('Disabled')
    expect(wrapper.text()).toContain('Healthy')
    expect(wrapper.text()).toContain('Unhealthy')
  })
  it('emits select with the provider key on provider-cell click', async () => {
    const wrapper = mount(ExternalIdpsTable, { props })
    await wrapper.find('[data-testid="external-idp-select-acme"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['acme']])
  })
})
