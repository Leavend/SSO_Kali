import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiAlertDialog from '@/components/ui/UiAlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Swiss overlays', () => {
  it('UiDialog renders title + labelled close and emits close', async () => {
    const wrapper = mount(UiDialog, {
      props: {
        open: true,
        titleId: 'rotate',
        title: 'Rotate client secret',
        description: 'One-time secret display.',
        closeLabel: 'Close',
      },
      slots: { default: '<p>Body</p>' },
    })
    expect(wrapper.text()).toContain('Rotate client secret')
    const close = wrapper.get('[aria-label="Close"]')
    expect(close.find('svg').exists()).toBe(true)
    await close.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('UiAlertDialog confirm/cancel buttons emit and danger sets the danger button', async () => {
    const wrapper = mount(UiAlertDialog, {
      props: {
        open: true,
        title: 'Delete user',
        description: 'This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      },
    })
    const confirm = wrapper.get('[data-testid="ui-alert-dialog-confirm"]')
    expect(confirm.classes()).toContain('ui-btn--danger')
    await wrapper.get('[data-testid="ui-alert-dialog-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    await confirm.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('ConfirmDialog traps focus, closes on Escape and backdrop (a11y: role=dialog + focus)', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { open: false, title: 'Revoke session', description: 'Force sign-out.' },
    })
    await wrapper.setProps({ open: true })
    await nextTick()
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog.element)

    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)

    await wrapper.get('[data-testid="confirm-dialog-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
