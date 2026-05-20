import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../pages/auth/LoginPage.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the production entry login page from src/pages/auth and walks the multi-step flow', async () => {
    const wrapper = mount(LoginPage, {
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          Transition: { template: '<div><slot /></div>' },
        },
      },
    })

    // Step 1: identifier-only.
    expect(wrapper.text()).toContain('Selamat datang kembali')
    expect(wrapper.find('#login-identifier').exists()).toBe(true)
    expect(wrapper.find('#login-password').exists()).toBe(false)

    await wrapper.find('#login-identifier').setValue('admin@example.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Step 2: password input + submit becomes the final step.
    expect(wrapper.find('#login-password').exists()).toBe(true)
    expect(wrapper.text()).toContain('Masukkan password')

    await wrapper.find('#login-password').setValue('password-secret')
    await flushPromises()

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
