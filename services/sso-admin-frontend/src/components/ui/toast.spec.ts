import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import UiToastProvider from './UiToastProvider.vue'
import { useToast } from './useToast'

const ToastHarness = defineComponent({
  components: { UiToastProvider },
  setup() {
    const { pushToast } = useToast()

    return { pushToast }
  },
  template: `
    <button type="button" @click="pushToast({ tone: 'step_up', title: 'Verifikasi ulang', description: 'Fresh auth diperlukan.', requestId: 'req-123' })">Toast</button>
    <UiToastProvider />
  `,
})

describe('UiToastProvider', () => {
  it('shows concise action feedback with request evidence', async () => {
    const wrapper = mount(ToastHarness)

    await wrapper.get('button').trigger('click')
    await nextTick()

    expect(wrapper.get('[role="status"]').text()).toContain('Verifikasi ulang')
    expect(wrapper.text()).toContain('req-123')
  })
})
