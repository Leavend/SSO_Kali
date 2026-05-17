import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoGlassSurface from '../SsoGlassSurface.vue'

describe('SsoGlassSurface', () => {
  it('renders a div by default with default variant classes', () => {
    const wrapper = mount(SsoGlassSurface, {
      slots: { default: 'content' },
    })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.text()).toBe('content')
    const classes = wrapper.classes()
    expect(classes).toContain('relative')
    expect(classes).toContain('border')
  })

  it('exposes data-slot for QA selectors', () => {
    const wrapper = mount(SsoGlassSurface)
    expect(wrapper.attributes('data-slot')).toBe('glass-surface')
  })

  it('applies elevated variant when requested', () => {
    const wrapper = mount(SsoGlassSurface, { props: { variant: 'elevated' } })
    const cls = wrapper.classes().join(' ')
    expect(cls).toContain('shadow-[var(--shadow-glass-lg)]')
    expect(cls).toContain('bg-[var(--glass-bg-elevated)]')
  })

  it('applies subtle variant when requested', () => {
    const wrapper = mount(SsoGlassSurface, { props: { variant: 'subtle' } })
    const cls = wrapper.classes().join(' ')
    expect(cls).toContain('shadow-none')
    expect(cls).toContain('border-dashed')
  })

  it('renders a different element when as prop is given', () => {
    const wrapper = mount(SsoGlassSurface, { props: { as: 'section' } })
    expect(wrapper.element.tagName).toBe('SECTION')
  })

  it('merges custom classes via cn()', () => {
    const wrapper = mount(SsoGlassSurface, { props: { class: 'mx-auto custom-x' } })
    expect(wrapper.classes()).toContain('mx-auto')
    expect(wrapper.classes()).toContain('custom-x')
  })
})
