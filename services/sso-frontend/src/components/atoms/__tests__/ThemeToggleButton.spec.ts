import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ThemeToggleButton from '../ThemeToggleButton.vue'

describe('ThemeToggleButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders a button with aria-label', () => {
    const wrapper = mount(ThemeToggleButton)
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('Ganti tema')
  })

  it('applies custom class prop', () => {
    const wrapper = mount(ThemeToggleButton, { props: { class: 'absolute right-4' } })
    const button = wrapper.find('button')
    expect(button.classes()).toContain('absolute')
  })

  it('renders an icon inside the button', () => {
    const wrapper = mount(ThemeToggleButton)
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
