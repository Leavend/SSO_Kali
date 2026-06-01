import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import ConfirmDialog from '../ConfirmDialog.vue'

const Harness = defineComponent({
  components: { ConfirmDialog },
  setup() {
    const open = ref(false)

    return { open }
  },
  template: `
    <main>
      <button data-testid="trigger" type="button" @click="open = true">Delete role</button>
      <a href="/admin/users" data-testid="background-link">Users</a>
      <ConfirmDialog
        :open="open"
        title="Delete role?"
        description="This removes role access for selected admins."
        confirm-label="Delete"
        cancel-label="Cancel"
        @confirm="open = false"
        @cancel="open = false"
      />
    </main>
  `,
})

async function openDialog() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const wrapper = mount(Harness, { attachTo: host })

  const trigger = wrapper.find('[data-testid="trigger"]')
  ;(trigger.element as HTMLButtonElement).focus()
  await trigger.trigger('click')
  await nextTick()

  return { host, wrapper }
}

describe('ConfirmDialog', () => {
  it('moves focus into the dialog when opened', async () => {
    const { host, wrapper } = await openDialog()

    expect(wrapper.find('[role="dialog"]').element).toBe(document.activeElement)

    wrapper.unmount()
    host.remove()
  })

  it('restores focus to the trigger when closed', async () => {
    const { host, wrapper } = await openDialog()
    const trigger = wrapper.find('[data-testid="trigger"]').element

    await wrapper.find('[data-testid="confirm-dialog-cancel"]').trigger('click')
    await nextTick()

    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
    host.remove()
  })

  it('keeps Tab focus inside the dialog actions', async () => {
    const { host, wrapper } = await openDialog()
    const dialog = wrapper.find('[role="dialog"]')
    const cancel = wrapper.find('[data-testid="confirm-dialog-cancel"]')
      .element as HTMLButtonElement
    const confirm = wrapper.find('[data-testid="confirm-dialog-confirm"]')
      .element as HTMLButtonElement

    confirm.focus()
    await dialog.trigger('keydown', { key: 'Tab' })

    expect(document.activeElement).toBe(cancel)

    cancel.focus()
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(confirm)

    wrapper.unmount()
    host.remove()
  })

  it('marks sibling background content inert while open', async () => {
    const { host, wrapper } = await openDialog()
    const trigger = wrapper.find('[data-testid="trigger"]').element as HTMLElement
    const backgroundLink = wrapper.find('[data-testid="background-link"]').element as HTMLElement

    expect(trigger.inert).toBe(true)
    expect(backgroundLink.inert).toBe(true)
    expect(trigger.getAttribute('aria-hidden')).toBe('true')

    await wrapper.find('[data-testid="confirm-dialog-cancel"]').trigger('click')
    await nextTick()

    expect(trigger.inert).toBe(false)
    expect(backgroundLink.inert).toBe(false)
    expect(trigger.hasAttribute('aria-hidden')).toBe(false)

    wrapper.unmount()
    host.remove()
  })
})
