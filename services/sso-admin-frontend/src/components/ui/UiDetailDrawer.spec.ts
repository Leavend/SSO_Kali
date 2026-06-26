import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import UiDetailDrawer from './UiDetailDrawer.vue'

/**
 * Host that mirrors the Users/Sessions usage: a table whose rows open a drawer,
 * so we can assert "table renders rows", "row → drawer opens", and that focus is
 * restored to the triggering control on close.
 */
const Host = defineComponent({
  components: { UiDetailDrawer },
  setup() {
    const open = ref(false)
    const rows = [
      { id: 'r1', name: 'Ayu Lestari' },
      { id: 'r2', name: 'Budi Santoso' },
    ]
    return { open, rows }
  },
  template: `
    <div>
      <table class="tbl tbl--clickable">
        <tbody>
          <tr v-for="row in rows" :key="row.id" tabindex="0" @click="open = true">
            <td>{{ row.name }}</td>
          </tr>
        </tbody>
      </table>
      <button class="opener" type="button" @click="open = true">Open</button>
      <UiDetailDrawer
        v-if="open"
        :open="open"
        title-id="host-drawer"
        title="Detail"
        description="Row detail"
        close-label="Close"
        @close="open = false"
      >
        <p class="drawer-content-marker">Drawer body</p>
      </UiDetailDrawer>
    </div>
  `,
})

describe('UiDetailDrawer host (table → drawer)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders one table row per record', () => {
    const wrapper = mount(Host, { attachTo: document.body })
    expect(wrapper.findAll('table.tbl tbody tr')).toHaveLength(2)
  })

  it('opens the drawer with dialog semantics when a row is activated', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.findAll('table.tbl tbody tr')[0]!.trigger('click')

    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.attributes('aria-labelledby')).toBe('host-drawer-title')
    expect(wrapper.find('.drawer-content-marker').exists()).toBe(true)
  })

  it('closes on Escape and on backdrop click', async () => {
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper.find('.opener').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    // Re-open then dismiss via the backdrop.
    await wrapper.find('.opener').trigger('click')
    await wrapper.find('[data-testid="drawer-overlay"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('restores focus to the triggering control after closing', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    const opener = wrapper.find('.opener').element as HTMLButtonElement
    opener.focus()
    expect(document.activeElement).toBe(opener)

    await wrapper.find('.opener').trigger('click')
    await nextTick()
    // Focus moves into the drawer (onto the close button) on open.
    expect(opener).not.toBe(document.activeElement)

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(document.activeElement).toBe(opener)
  })

  it('renders the close control with the provided accessible label', async () => {
    const wrapper = mount(Host, { attachTo: document.body })
    await wrapper.find('.opener').trigger('click')
    const close = wrapper.get('.drawer-close')
    expect(close.attributes('aria-label')).toBe('Close')
  })
})

describe('UiDetailDrawer focus trap', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const TrapHost = defineComponent({
    components: { UiDetailDrawer },
    setup() {
      const open = ref(true)
      return { open }
    },
    template: `
      <UiDetailDrawer
        :open="open"
        title-id="trap"
        title="Trap"
        description="trap"
        close-label="Close"
        @close="open = false"
      >
        <button class="first-action" type="button">First</button>
        <button class="last-action" type="button">Last</button>
      </UiDetailDrawer>
    `,
  })

  it('keeps Tab focus inside the panel (Shift+Tab from the first wraps to the last)', async () => {
    const wrapper = mount(TrapHost, { attachTo: document.body })
    await nextTick()

    const first = wrapper.get('.drawer-close').element as HTMLElement
    first.focus()
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Tab', shiftKey: true })

    const last = wrapper.get('.last-action').element as HTMLElement
    expect(document.activeElement).toBe(last)
  })
})
