import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoAlertBanner from '../SsoAlertBanner.vue'

describe('SsoAlertBanner', () => {
  it('uses balanced semantic colors in light and dark modes', () => {
    const wrapper = mount(SsoAlertBanner, {
      props: { tone: 'error', message: 'Sesi gagal diperbarui.' },
    })

    const classes = wrapper.classes()

    expect(classes).toContain('border-error-700/40')
    expect(classes).toContain('bg-error-50')
    expect(classes).toContain('text-error-700')
    expect(classes).toContain('dark:border-error-700/50')
    expect(classes).toContain('dark:bg-error-950/30')
    expect(classes).toContain('dark:text-error-300')
  })
})
