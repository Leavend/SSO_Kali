import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusPanel from '../web/components/StatusPanel.vue'
import { authStatusCopy, REAUTH_REQUIRED_ROUTE } from '../shared/auth-status'

describe('StatusPanel', () => {
  it('renders action copy for auth status states', () => {
    const wrapper = mount(StatusPanel, {
      props: {
        copy: authStatusCopy[REAUTH_REQUIRED_ROUTE],
      },
    })

    expect(wrapper.text()).toContain('Sesi perlu diverifikasi ulang')
    expect(wrapper.find('a[href^="/auth/login"]').exists()).toBe(true)
  })
})
