import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'

describe('Swiss form controls', () => {
  it('UiButton renders the Swiss variant class and stays keyboard focusable', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'danger', size: 'sm' },
      slots: { default: 'Delete' },
    })
    const btn = wrapper.get('button')
    expect(btn.classes()).toContain('ui-btn')
    expect(btn.classes()).toContain('ui-btn--danger')
    expect(btn.classes()).toContain('ui-btn--sm')
    expect(btn.attributes('type')).toBe('button')
    expect(btn.attributes('disabled')).toBeUndefined()
    expect(btn.text()).toBe('Delete')
  })

  it('UiInput emits the typed value and exposes aria-invalid only when invalid', async () => {
    const wrapper = mount(UiInput, { props: { modelValue: '', invalid: true } })
    const input = wrapper.get('input')
    expect(input.classes()).toContain('ui-input')
    expect(input.attributes('aria-invalid')).toBe('true')
    await input.setValue('admin@example.com')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['admin@example.com'])
  })

  it('UiSelect renders its options and emits the chosen value', async () => {
    const wrapper = mount(UiSelect, {
      props: {
        modelValue: 'id',
        options: [
          { value: 'id', label: 'Indonesia' },
          { value: 'en', label: 'English' },
        ],
      },
    })
    expect(wrapper.findAll('option')).toHaveLength(2)
    await wrapper.get('select').setValue('en')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['en'])
  })

  it('UiSwitch exposes switch semantics and toggles on click (a11y: role+aria-checked)', async () => {
    const wrapper = mount(UiSwitch, {
      props: { modelValue: false, label: 'Local account enabled' },
    })
    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('false')
    expect(sw.attributes('aria-label')).toBe('Local account enabled')
    expect(wrapper.find('.ui-switch__track').exists()).toBe(true)
    await sw.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('UiSwitch aria-checked round-trip: reflects true when modelValue is true', () => {
    const wrapper = mount(UiSwitch, {
      props: { modelValue: true, label: 'Local account enabled' },
    })
    const sw = wrapper.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('true')
  })

  it('UiTextarea forwards rows and emits the edited value', async () => {
    const wrapper = mount(UiTextarea, { props: { modelValue: '', rows: 6 } })
    const ta = wrapper.get('textarea')
    expect(ta.attributes('rows')).toBe('6')
    await ta.setValue('rotation reason')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['rotation reason'])
  })
})
