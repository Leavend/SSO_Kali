import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBrandMark from '../AppBrandMark.vue'

describe('AppBrandMark', () => {
  it('renders with default size md', () => {
    const wrapper = mount(AppBrandMark)
    expect(wrapper.find('span').exists()).toBe(true)
    expect(wrapper.find('span').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('span').classes()).toContain('size-9')
  })

  it('renders sm size', () => {
    const wrapper = mount(AppBrandMark, { props: { size: 'sm' } })
    expect(wrapper.find('span').classes()).toContain('size-7')
  })

  it('renders lg size', () => {
    const wrapper = mount(AppBrandMark, { props: { size: 'lg' } })
    expect(wrapper.find('span').classes()).toContain('size-11')
  })

  it('applies custom class', () => {
    const wrapper = mount(AppBrandMark, { props: { class: 'mx-auto' } })
    expect(wrapper.find('span').classes()).toContain('mx-auto')
  })

  it('is aria-hidden (decorative)', () => {
    const wrapper = mount(AppBrandMark)
    expect(wrapper.find('span').attributes('aria-hidden')).toBe('true')
  })
})
