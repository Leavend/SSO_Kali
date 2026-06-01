import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import UiAlertDialog from './UiAlertDialog.vue'

describe('UiAlertDialog', () => {
  it('renders a Reka alert dialog with safe admin actions', async () => {
    const wrapper = mount(UiAlertDialog, {
      props: {
        open: true,
        title: 'Reset MFA?',
        description: 'This forces the admin to re-enroll MFA.',
        confirmLabel: 'Reset MFA',
      },
      attachTo: document.body,
    })

    await nextTick()

    expect(document.body.textContent).toContain('Reset MFA?')
    expect(document.body.textContent).toContain('This forces the admin to re-enroll MFA.')
    expect(document.body.textContent).toContain('Reset MFA')

    wrapper.unmount()
  })
})
