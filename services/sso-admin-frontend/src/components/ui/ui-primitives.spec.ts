import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiDataList from './UiDataList.vue'
import UiEmptyState from './UiEmptyState.vue'
import UiFormField from './UiFormField.vue'
import UiInput from './UiInput.vue'
import UiSelect from './UiSelect.vue'
import UiSkeleton from './UiSkeleton.vue'
import UiTextarea from './UiTextarea.vue'
import UiSwitch from './UiSwitch.vue'

describe('admin ui primitives', () => {
  it('renders skeleton loaders with stable aria state', () => {
    const wrapper = mount(UiSkeleton, { props: { rows: 3, label: 'Memuat users' } })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-label')).toBe('Memuat users')
    expect(wrapper.findAll('[data-testid="ui-skeleton-row"]')).toHaveLength(3)
  })

  it('renders empty state copy and CTA without layout-specific markup', () => {
    const wrapper = mount(UiEmptyState, {
      props: { title: 'Belum ada evidence', description: 'Tambahkan filter atau refresh data.' },
      slots: { action: '<button type="button">Refresh</button>' },
    })

    expect(wrapper.text()).toContain('Belum ada evidence')
    expect(wrapper.text()).toContain('Refresh')
  })

  it('wires form field label hint error and required state', () => {
    const wrapper = mount(UiFormField, {
      props: {
        id: 'email',
        label: 'Email',
        hint: 'Alamat kerja',
        error: 'Wajib diisi',
        required: true,
      },
      slots: { default: '<input id="email" />' },
    })

    expect(wrapper.get('label').attributes('for')).toBe('email')
    expect(wrapper.text()).toContain('Alamat kerja')
    expect(wrapper.text()).toContain('Wajib diisi')
    expect(wrapper.get('label').attributes('data-required')).toBe('true')
  })

  it('normalizes input select textarea and switch focusable controls', async () => {
    const input = mount(UiInput, { props: { modelValue: 'admin@example.com' } })
    const select = mount(UiSelect, {
      props: { modelValue: 'id', options: [{ value: 'id', label: 'Indonesia' }] },
    })
    const textarea = mount(UiTextarea, { props: { modelValue: 'audit reason' } })
    const toggle = mount(UiSwitch, { props: { modelValue: false, label: 'Dark mode' } })

    await input.get('input').setValue('operator@example.com')
    await select.get('select').setValue('id')
    await textarea.get('textarea').setValue('rotation reason')
    await toggle.get('button').trigger('click')

    expect(input.emitted('update:modelValue')?.at(-1)).toEqual(['operator@example.com'])
    expect(select.get('option').text()).toBe('Indonesia')
    expect(textarea.emitted('update:modelValue')?.at(-1)).toEqual(['rotation reason'])
    expect(toggle.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('renders a dense data list with cursor pagination actions', () => {
    const wrapper = mount(UiDataList, {
      props: {
        caption: 'Audit events',
        columns: [
          { key: 'event', label: 'Event' },
          { key: 'actor', label: 'Actor' },
        ],
        rows: [{ id: 'evt-1', event: 'admin.login', actor: 'admin@example.com' }],
        nextLabel: 'Next cursor',
      },
    })

    expect(wrapper.get('table').text()).toContain('admin.login')
    expect(wrapper.get('thead').classes()).toContain('sticky')
    expect(wrapper.text()).toContain('Next cursor')
  })
})
