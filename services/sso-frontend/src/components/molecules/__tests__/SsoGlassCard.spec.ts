import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoGlassCard from '../SsoGlassCard.vue'

describe('SsoGlassCard', () => {
  it('renders a section element by default', () => {
    const wrapper = mount(SsoGlassCard, {
      slots: { default: '<p>body</p>' },
    })
    expect(wrapper.element.tagName).toBe('SECTION')
    expect(wrapper.find('p').text()).toBe('body')
  })

  it('applies default size max-w-md', () => {
    const wrapper = mount(SsoGlassCard)
    expect(wrapper.classes()).toContain('max-w-md')
    expect(wrapper.classes()).toContain('p-8')
  })

  it('applies wide size max-w-lg when size=wide', () => {
    const wrapper = mount(SsoGlassCard, { props: { size: 'wide' } })
    expect(wrapper.classes()).toContain('max-w-lg')
  })

  it('renders header slot inside <header>', () => {
    const wrapper = mount(SsoGlassCard, {
      slots: { header: '<h1 id="title">Sign in</h1>' },
    })
    const header = wrapper.find('header')
    expect(header.exists()).toBe(true)
    expect(header.find('h1').text()).toBe('Sign in')
  })

  it('does not render <header> when no header slot', () => {
    const wrapper = mount(SsoGlassCard)
    expect(wrapper.find('header').exists()).toBe(false)
  })

  it('renders footer slot inside <footer>', () => {
    const wrapper = mount(SsoGlassCard, {
      slots: { footer: '<a href="/x">Back</a>' },
    })
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    expect(footer.find('a').text()).toBe('Back')
  })

  it('forwards aria-labelledby to root', () => {
    const wrapper = mount(SsoGlassCard, {
      props: { ariaLabelledby: 'login-title' },
    })
    expect(wrapper.attributes('aria-labelledby')).toBe('login-title')
  })

  it('merges custom class', () => {
    const wrapper = mount(SsoGlassCard, { props: { class: 'shadow-extra' } })
    expect(wrapper.classes()).toContain('shadow-extra')
  })
})
