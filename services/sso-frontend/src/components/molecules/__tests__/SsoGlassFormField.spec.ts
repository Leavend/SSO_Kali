import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SsoGlassFormField from '../SsoGlassFormField.vue'

function createField(props: Record<string, unknown> = {}) {
  return mount(SsoGlassFormField, {
    props: { id: 'email', label: 'Email', modelValue: '', ...props },
  })
}

describe('SsoGlassFormField', () => {
  it('renders label tied to the input via for/id', () => {
    const wrapper = createField()
    const label = wrapper.find('label')
    expect(label.exists()).toBe(true)
    expect(label.attributes('for')).toBe('email')
    expect(label.text()).toContain('Email')
  })

  it('renders required indicator when required', () => {
    const wrapper = createField({ required: true })
    const star = wrapper.find('label span')
    expect(star.exists()).toBe(true)
    expect(star.attributes('aria-hidden')).toBe('true')
  })

  it('emits update:modelValue when the input changes', async () => {
    const wrapper = createField()
    await wrapper.find('input').setValue('a@b.co')
    expect(wrapper.emitted('update:modelValue')).toEqual([['a@b.co']])
  })

  it('shows hint with correct id when no error', () => {
    const wrapper = createField({ hint: 'We never share emails' })
    const hint = wrapper.find('#email-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('We never share emails')
  })

  it('hides hint when error is present (error wins)', () => {
    const wrapper = createField({
      hint: 'Hint here',
      error: 'Email wajib diisi.',
    })
    expect(wrapper.find('#email-hint').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').text()).toContain('Email wajib diisi.')
  })

  it('label uses error color class when in error state', () => {
    const wrapper = createField({ error: 'X' })
    expect(wrapper.find('label').classes()).toContain('text-error-700')
  })
})
