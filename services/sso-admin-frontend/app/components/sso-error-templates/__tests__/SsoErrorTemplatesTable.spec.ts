// app/components/sso-error-templates/__tests__/SsoErrorTemplatesTable.spec.ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoErrorTemplatesTable from '@/components/sso-error-templates/SsoErrorTemplatesTable.vue'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const templates: SsoErrorTemplate[] = [
  {
    error_code: 'access_denied',
    locale: 'en',
    title: 'Access denied',
    message: 'No access.',
    action_label: 'Back',
    action_url: null,
    retry_allowed: false,
    alternative_login_allowed: false,
    is_enabled: true,
  },
  {
    error_code: 'access_denied',
    locale: 'id',
    title: 'Akses ditolak',
    message: 'Tidak ada akses.',
    action_label: 'Kembali',
    action_url: null,
    retry_allowed: false,
    alternative_login_allowed: false,
    is_enabled: false,
  },
]

const props = {
  templates,
  caption: 'Error templates',
  codeLabel: 'Code',
  localeLabel: 'Locale',
  titleLabel: 'Title',
  statusLabel: 'Status',
  enabledText: 'Enabled',
  disabledText: 'Disabled',
}

describe('SsoErrorTemplatesTable', () => {
  it('renders one selectable row per template with the title + status label', () => {
    const wrapper = mount(SsoErrorTemplatesTable, { props })
    expect(wrapper.text()).toContain('Access denied')
    expect(wrapper.text()).toContain('Akses ditolak')
    expect(wrapper.text()).toContain('Enabled')
    expect(wrapper.text()).toContain('Disabled')
  })
  it('emits select with the composite error_code::locale key', async () => {
    const wrapper = mount(SsoErrorTemplatesTable, { props })
    await wrapper.get('[data-testid="sso-templates-select-access_denied::id"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['access_denied::id'])
  })
})
