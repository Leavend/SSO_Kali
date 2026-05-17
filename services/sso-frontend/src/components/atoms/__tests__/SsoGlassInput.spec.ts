import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoGlassInput from '../SsoGlassInput.vue'

function createInput(props: Record<string, unknown> = {}) {
  return mount(SsoGlassInput, {
    props: { id: 'test-input', modelValue: '', ...props },
  })
}

describe('SsoGlassInput', () => {
  describe('rendering', () => {
    it('renders an input with the correct id', () => {
      const wrapper = createInput()
      expect(wrapper.find('input').attributes('id')).toBe('test-input')
    })

    it('passes type, autocomplete, and inputmode through', () => {
      const wrapper = createInput({
        type: 'email',
        autocomplete: 'email',
        inputmode: 'email',
      })
      const input = wrapper.find('input')
      expect(input.attributes('type')).toBe('email')
      expect(input.attributes('autocomplete')).toBe('email')
      expect(input.attributes('inputmode')).toBe('email')
    })

    it('uses Liquid Glass pill shape by default', () => {
      const wrapper = createInput()
      const inputShell = wrapper.find('input').element.parentElement!
      expect(Array.from(inputShell.classList)).toContain('sso-glass-pill')
      expect(inputShell.className).toContain('rounded-[var(--radius-glass-pill)]')
    })

    it('falls back to rounded-xl glass surface when pill=false', () => {
      const wrapper = createInput({ pill: false })
      const inputShell = wrapper.find('input').element.parentElement!
      expect(Array.from(inputShell.classList)).not.toContain('sso-glass-pill')
      expect(inputShell.className).toContain('rounded-[var(--radius-glass-xl)]')
    })
  })

  describe('v-model', () => {
    it('emits update:modelValue on input', async () => {
      const wrapper = createInput()
      const input = wrapper.find('input')
      await input.setValue('hello@example.com')
      expect(wrapper.emitted('update:modelValue')).toEqual([['hello@example.com']])
    })

    it('reflects the modelValue prop on the input', () => {
      const wrapper = createInput({ modelValue: 'preset' })
      expect((wrapper.find('input').element as HTMLInputElement).value).toBe('preset')
    })
  })

  describe('error state', () => {
    it('renders the error message inside an alert role', () => {
      const wrapper = createInput({ error: 'Email tidak valid' })
      const alert = wrapper.find('[role="alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.attributes('aria-live')).toBe('assertive')
      expect(alert.text()).toContain('Email tidak valid')
    })

    it('marks input as aria-invalid', () => {
      const wrapper = createInput({ error: 'X' })
      expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
    })

    it('connects aria-describedby to the error id', () => {
      const wrapper = createInput({ error: 'X' })
      const input = wrapper.find('input')
      expect(input.attributes('aria-describedby')).toBe('test-input-error')
      expect(wrapper.find('#test-input-error').exists()).toBe(true)
    })

    it('does not render error region when no error', () => {
      const wrapper = createInput()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  describe('required', () => {
    it('sets aria-required when required prop is true', () => {
      const wrapper = createInput({ required: true })
      expect(wrapper.find('input').attributes('aria-required')).toBe('true')
    })

    it('omits aria-required when not required', () => {
      const wrapper = createInput()
      expect(wrapper.find('input').attributes('aria-required')).toBeUndefined()
    })
  })

  describe('password toggle', () => {
    it('renders the toggle button only for type=password', () => {
      const text = createInput({ type: 'text' })
      expect(text.find('button').exists()).toBe(false)

      const pwd = createInput({ type: 'password' })
      expect(pwd.find('button').exists()).toBe(true)
    })

    it('toggles input type between password and text', async () => {
      const wrapper = createInput({ type: 'password' })
      const button = wrapper.find('button')
      const input = wrapper.find('input')

      expect(input.attributes('type')).toBe('password')
      expect(button.attributes('aria-pressed')).toBe('false')

      await button.trigger('click')
      expect(wrapper.find('input').attributes('type')).toBe('text')
      expect(wrapper.find('button').attributes('aria-pressed')).toBe('true')
    })

    it('exposes localized aria-label that updates on toggle', async () => {
      const wrapper = createInput({ type: 'password' })
      const button = wrapper.find('button')
      expect(button.attributes('aria-label')).toBe('Tampilkan password')
      await button.trigger('click')
      expect(wrapper.find('button').attributes('aria-label')).toBe('Sembunyikan password')
    })
  })

  describe('disabled', () => {
    it('disables both input and password toggle', () => {
      const wrapper = createInput({ type: 'password', disabled: true })
      expect(wrapper.find('input').attributes('disabled')).toBeDefined()
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })
  })
})
