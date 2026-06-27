import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiFormField from '@/components/ui/UiFormField.vue'
import FormSection from '@/components/form/FormSection.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'

describe('Swiss form scaffolding', () => {
  it('UiFormField wires label/for, hint, error(role=alert) and required marker', () => {
    const wrapper = mount(UiFormField, {
      props: {
        id: 'email',
        label: 'Email',
        hint: 'Work address',
        error: 'Required',
        required: true,
      },
      slots: { default: '<input id="email" />' },
    })
    expect(wrapper.get('label').attributes('for')).toBe('email')
    expect(wrapper.get('label').attributes('data-required')).toBe('true')
    expect(wrapper.text()).toContain('Work address')
    expect(wrapper.get('[role="alert"]').text()).toBe('Required')
  })

  it('FormSection renders title, description and its fields slot', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Identity', description: 'Login identifiers.' },
      slots: { default: '<input id="nik" />' },
    })
    expect(wrapper.text()).toContain('Identity')
    expect(wrapper.text()).toContain('Login identifiers.')
    expect(wrapper.find('#nik').exists()).toBe(true)
  })

  it('FormPageShell shows breadcrumb + actions, disables submit when invalid, emits submit/cancel', async () => {
    const wrapper = mount(FormPageShell, {
      props: {
        parentLabel: 'Users',
        activeLabel: 'New user',
        title: 'New user',
        submitLabel: 'Save',
        isInvalid: true,
      },
      slots: { default: '<p>Body</p>' },
    })
    expect(wrapper.text()).toContain('Users')
    expect(wrapper.text()).toContain('New user')
    const submit = wrapper.get('[data-testid="form-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.setProps({ isInvalid: false })
    await submit.trigger('click')
    await wrapper.get('[data-testid="form-cancel"]').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('FormPageShell marks the submit button busy while submitting', () => {
    const wrapper = mount(FormPageShell, {
      props: {
        parentLabel: 'Users',
        activeLabel: 'New user',
        title: 'New user',
        submitLabel: 'Save',
        isSubmitting: true,
      },
    })
    const submit = wrapper.get('[data-testid="form-submit"]')
    expect(submit.attributes('aria-busy')).toBe('true')
    expect(submit.attributes('disabled')).toBeDefined()
  })

  it('UiFormField exposes sr-only required text for AT when required, absent when not', () => {
    const requiredWrapper = mount(UiFormField, {
      props: { id: 'name', label: 'Name', required: true },
      slots: { default: '<input id="name" />' },
    })
    const srSpan = requiredWrapper.find('.sr-only')
    expect(srSpan.exists()).toBe(true)
    expect(srSpan.text()).toBe('(required)')
    expect(srSpan.attributes('aria-hidden')).toBeUndefined()

    const optionalWrapper = mount(UiFormField, {
      props: { id: 'bio', label: 'Bio', required: false },
      slots: { default: '<input id="bio" />' },
    })
    expect(optionalWrapper.find('.sr-only').exists()).toBe(false)
  })

  it('FormPageShell active breadcrumb carries aria-current="page"', () => {
    const wrapper = mount(FormPageShell, {
      props: {
        parentLabel: 'Clients',
        activeLabel: 'New client',
        title: 'New client',
        submitLabel: 'Save',
      },
    })
    const active = wrapper.find('.form-shell__breadcrumb-active')
    expect(active.exists()).toBe(true)
    expect(active.attributes('aria-current')).toBe('page')
  })

  it('UiFormField renders hint with stable id for aria-describedby wiring', () => {
    const wrapper = mount(UiFormField, {
      props: { id: 'slug', label: 'Slug', hint: 'URL-safe identifier' },
      slots: { default: '<input id="slug" />' },
    })
    const hint = wrapper.find('#slug-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('URL-safe identifier')
  })
})
