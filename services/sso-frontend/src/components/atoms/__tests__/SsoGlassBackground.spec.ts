import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoGlassBackground from '../SsoGlassBackground.vue'

describe('SsoGlassBackground', () => {
  it('is decorative and aria-hidden', () => {
    const wrapper = mount(SsoGlassBackground)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('uses pointer-events: none and absolute positioning', () => {
    const wrapper = mount(SsoGlassBackground)
    const cls = wrapper.classes()
    expect(cls).toContain('pointer-events-none')
    expect(cls).toContain('absolute')
  })

  it('renders three blob layers', () => {
    const wrapper = mount(SsoGlassBackground)
    expect(wrapper.findAll('.sso-glass-blob')).toHaveLength(3)
  })

  it.each(['auth', 'consent', 'error', 'mfa'] as const)(
    'accepts preset %s without throwing',
    (preset) => {
      expect(() => mount(SsoGlassBackground, { props: { preset } })).not.toThrow()
    },
  )

  it('uses brand-100 in auth preset', () => {
    const wrapper = mount(SsoGlassBackground, { props: { preset: 'auth' } })
    const blob1 = wrapper.find('.sso-glass-blob--1')
    expect(blob1.attributes('style') ?? '').toContain('var(--color-brand-100)')
  })

  it('uses error-50 in error preset', () => {
    const wrapper = mount(SsoGlassBackground, { props: { preset: 'error' } })
    const blob1 = wrapper.find('.sso-glass-blob--1')
    expect(blob1.attributes('style') ?? '').toContain('var(--color-error-50)')
  })
})
