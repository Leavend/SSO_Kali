import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoSpinner from '../SsoSpinner.vue'

describe('SsoSpinner', () => {
  it('renders with role="status" and is aria-hidden by default', () => {
    const wrapper = mount(SsoSpinner)
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('renders Loader2 with animate-spin', () => {
    const wrapper = mount(SsoSpinner)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.classes()).toContain('animate-spin')
  })

  it('applies size sm by default (size-4)', () => {
    const wrapper = mount(SsoSpinner)
    expect(wrapper.find('svg').classes()).toContain('size-4')
  })

  it.each([
    ['xs', 'size-3'],
    ['sm', 'size-4'],
    ['md', 'size-5'],
    ['lg', 'size-6'],
  ] as const)('size %s maps to class %s', (size, expected) => {
    const wrapper = mount(SsoSpinner, { props: { size } })
    expect(wrapper.find('svg').classes()).toContain(expected)
  })

  it.each([
    ['default', 'text-current'],
    ['inverse', 'text-white'],
    ['brand', 'text-brand-600'],
    ['muted', 'text-[var(--text-muted)]'],
  ] as const)('tone %s applies class %s', (tone, expected) => {
    const wrapper = mount(SsoSpinner, { props: { tone } })
    expect(wrapper.classes()).toContain(expected)
  })

  it('merges custom class', () => {
    const wrapper = mount(SsoSpinner, { props: { class: 'extra-class' } })
    expect(wrapper.classes()).toContain('extra-class')
  })
})
