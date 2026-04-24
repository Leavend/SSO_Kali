import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('renders the router outlet safely', () => {
    const wrapper = mount(App, {
      global: {
        stubs: ['RouterView'],
      },
    })

    expect(wrapper.html()).toContain('router-view-stub')
  })
})
