import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiButton from './UiButton.vue'

describe('UiButton', () => {
  it('uses cva variants and supports lucide icons through slots', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'danger', size: 'sm' },
      slots: { default: '<svg data-testid="icon" aria-hidden="true"></svg><span>Revoke</span>' },
    })

    expect(wrapper.classes()).toContain('bg-destructive')
    expect(wrapper.classes()).toContain('min-h-9')
    expect(wrapper.find('[data-testid="icon"]').exists()).toBe(true)
  })
})
