import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SecurityMfaCard from '../SecurityMfaCard.vue'

describe('SecurityMfaCard', () => {
  function mountCard(isEnabled: boolean) {
    return mount(SecurityMfaCard, {
      props: {
        isEnabled,
        summary: '6 recovery code tersisa · TOTP aktif · Diverifikasi',
        error: null,
      },
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a @click="$emit(\'click\')"><slot /></a>',
          },
        },
      },
    })
  }

  it('routes inactive users to the MFA settings wizard instead of starting enrollment inline', async () => {
    const wrapper = mountCard(false)
    expect(wrapper.text()).toContain('Belum diaktifkan')
    expect(wrapper.text()).toContain('Aktifkan MFA')
    expect(wrapper.findAll('a')).toHaveLength(2)
    expect(wrapper.emitted('start-enrollment')).toBeUndefined()
  })

  it('shows active MFA datapoints and hides the activation CTA', () => {
    const wrapper = mountCard(true)

    expect(wrapper.text()).toContain('Aktif')
    expect(wrapper.text()).toContain('6 recovery code tersisa')
    expect(wrapper.text()).toContain(
      'Kelola aplikasi autentikasi dan kode cadangan untuk akun kamu.',
    )
    expect(wrapper.text()).toContain('Kelola MFA')
    expect(wrapper.text()).not.toContain('Aktifkan MFA')
  })
})
