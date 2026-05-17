import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoGlassButton from '../SsoGlassButton.vue'

describe('SsoGlassButton', () => {
  describe('rendering', () => {
    it('renders a button element with default type=button', () => {
      const wrapper = mount(SsoGlassButton, {
        slots: { default: 'Sign in' },
      })
      expect(wrapper.element.tagName).toBe('BUTTON')
      expect(wrapper.attributes('type')).toBe('button')
      expect(wrapper.text()).toBe('Sign in')
    })

    it('honours type=submit when requested', () => {
      const wrapper = mount(SsoGlassButton, { props: { type: 'submit' } })
      expect(wrapper.attributes('type')).toBe('submit')
    })

    it('renders leading and trailing slots when not loading', () => {
      const wrapper = mount(SsoGlassButton, {
        slots: {
          leading: '<span data-testid="lead">→</span>',
          default: 'Continue',
          trailing: '<span data-testid="trail">↦</span>',
        },
      })
      expect(wrapper.find('[data-testid="lead"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="trail"]').exists()).toBe(true)
    })
  })

  describe('variants', () => {
    it.each([
      ['primary', 'bg-brand-600'],
      ['glass', 'bg-[var(--glass-bg-primary)]'],
      ['ghost', 'bg-transparent'],
      ['destructive', 'bg-error-700'],
    ] as const)('variant %s applies %s', (variant, expectedClass) => {
      const wrapper = mount(SsoGlassButton, { props: { variant } })
      expect(wrapper.classes().join(' ')).toContain(expectedClass)
    })
  })

  describe('sizes — touch target compliance', () => {
    it('size md = h-11 (≥44px WCAG 2.5.5)', () => {
      const wrapper = mount(SsoGlassButton, { props: { size: 'md' } })
      expect(wrapper.classes()).toContain('h-11')
    })

    it('size icon = 44×44 (≥44px WCAG 2.5.5)', () => {
      const wrapper = mount(SsoGlassButton, { props: { size: 'icon' } })
      const cls = wrapper.classes()
      expect(cls).toContain('h-11')
      expect(cls).toContain('w-11')
    })

    it('size fullWidth = h-12 + w-full', () => {
      const wrapper = mount(SsoGlassButton, { props: { size: 'fullWidth' } })
      const cls = wrapper.classes()
      expect(cls).toContain('h-12')
      expect(cls).toContain('w-full')
    })
  })

  describe('loading state', () => {
    it('renders spinner and hides leading slot when loading', () => {
      const wrapper = mount(SsoGlassButton, {
        props: { loading: true },
        slots: {
          leading: '<span data-testid="lead">L</span>',
          default: 'Memproses…',
        },
      })
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lead"]').exists()).toBe(false)
    })

    it('sets aria-busy when loading', () => {
      const wrapper = mount(SsoGlassButton, { props: { loading: true } })
      expect(wrapper.attributes('aria-busy')).toBe('true')
    })

    it('disables the button while loading', () => {
      const wrapper = mount(SsoGlassButton, { props: { loading: true } })
      expect(wrapper.attributes('disabled')).toBeDefined()
    })

    it('does not emit click when loading', async () => {
      const wrapper = mount(SsoGlassButton, { props: { loading: true } })
      await wrapper.trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })
  })

  describe('disabled state', () => {
    it('applies disabled attribute', () => {
      const wrapper = mount(SsoGlassButton, { props: { disabled: true } })
      expect(wrapper.attributes('disabled')).toBeDefined()
    })

    it('does not emit click when disabled', async () => {
      const wrapper = mount(SsoGlassButton, { props: { disabled: true } })
      await wrapper.trigger('click')
      expect(wrapper.emitted('click')).toBeUndefined()
    })
  })

  describe('a11y', () => {
    it('forwards aria-label', () => {
      const wrapper = mount(SsoGlassButton, {
        props: { ariaLabel: 'Tutup dialog', size: 'icon' },
      })
      expect(wrapper.attributes('aria-label')).toBe('Tutup dialog')
    })

    it('emits click on activation', async () => {
      const wrapper = mount(SsoGlassButton)
      await wrapper.trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('has focus-visible glass focus shadow class', () => {
      const wrapper = mount(SsoGlassButton)
      expect(wrapper.classes().join(' ')).toContain(
        'focus-visible:shadow-[var(--ring-glass-focus)]',
      )
    })
  })
})
